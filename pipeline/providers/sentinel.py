"""Small, bounded Sentinel-2 L2A CDSE Catalog + Process adapter."""
from __future__ import annotations
import datetime as dt
import io
import math
import os
import pathlib
import requests
import numpy as np
import rasterio
from rasterio.features import shapes
from rasterio.warp import transform_bounds,transform_geom
from PIL import Image
from pipeline.analysis.optical import VERSION,analyze_pair

EVALSCRIPT='''//VERSION=3
function setup(){return {input:[{bands:["B02","B03","B04","B08","SCL","dataMask"]}],output:{bands:6,sampleType:SampleType.FLOAT32}};}
function evaluatePixel(s){return [s.B02,s.B03,s.B04,s.B08,s.SCL,s.dataMask];}'''

def oauth_token(config:dict) -> str:
    client=os.getenv('CDSE_CLIENT_ID');secret=os.getenv('CDSE_CLIENT_SECRET')
    if not client or not secret:raise RuntimeError('missing_cdse_oauth_client')
    r=requests.post(config['sentinel']['token_url'],data={'grant_type':'client_credentials','client_id':client,'client_secret':secret},timeout=25);r.raise_for_status()
    return r.json()['access_token']

def catalog_search(config:dict,token:str,box:list[float],start:dt.datetime,end:dt.datetime) -> list[dict]:
    payload={'bbox':box,'datetime':f'{start.isoformat().replace("+00:00","Z")}/{end.isoformat().replace("+00:00","Z")}','collections':[config['sentinel']['product_id']],'limit':40}
    r=requests.post(config['sentinel']['catalog_url'],headers={'Authorization':f'Bearer {token}'},json=payload,timeout=35);r.raise_for_status()
    return r.json().get('features',[])

def choose_pair(config:dict,token:str,box:list[float]) -> tuple[dict,dict]:
    now=dt.datetime.now(dt.timezone.utc);settings=config['sentinel']
    recent=catalog_search(config,token,box,now-dt.timedelta(days=settings['current_window_days']),now)
    def acceptable(scene):return float(scene.get('properties',{}).get('eo:cloud_cover',100))<=settings['max_scene_cloud_percent']
    recent=sorted((x for x in recent if acceptable(x)),key=lambda x:x['properties']['datetime'],reverse=True)
    for current in recent:
        when=dt.datetime.fromisoformat(current['properties']['datetime'].replace('Z','+00:00'))
        earlier=catalog_search(config,token,box,when-dt.timedelta(days=settings['baseline_max_days']),when-dt.timedelta(days=settings['baseline_min_days']))
        tile=current.get('properties',{}).get('s2:mgrs_tile')
        comparable=[x for x in earlier if acceptable(x) and (not tile or x.get('properties',{}).get('s2:mgrs_tile')==tile)]
        if comparable:return max(comparable,key=lambda x:x['properties']['datetime']),current
    raise RuntimeError('insufficient_clear_imagery: no comparable STAC scene pair within bounded windows')

def fetch_scene(config:dict,token:str,box:list[float],scene:dict) -> tuple[np.ndarray,dict]:
    utm_box=transform_bounds('EPSG:4326','EPSG:32748',*box)
    pixels=int(config['sentinel']['output_pixel_m']);limit=int(config['sentinel']['max_output_pixels'])
    width=math.ceil((utm_box[2]-utm_box[0])/pixels);height=math.ceil((utm_box[3]-utm_box[1])/pixels)
    if width>limit or height>limit:raise RuntimeError(f'optical AOI exceeds {limit}x{limit} output pixels')
    when=dt.datetime.fromisoformat(scene['properties']['datetime'].replace('Z','+00:00'))
    start=(when-dt.timedelta(minutes=2)).isoformat().replace('+00:00','Z');end=(when+dt.timedelta(minutes=2)).isoformat().replace('+00:00','Z')
    payload={'input':{'bounds':{'bbox':list(utm_box),'properties':{'crs':'http://www.opengis.net/def/crs/EPSG/0/32748'}},'data':[{'type':'sentinel-2-l2a','dataFilter':{'timeRange':{'from':start,'to':end},'maxCloudCoverage':config['sentinel']['max_scene_cloud_percent'],'mosaickingOrder':'leastCC'},'processing':{'upsampling':'NEAREST','downsampling':'NEAREST'}}]},'output':{'width':width,'height':height,'responses':[{'identifier':'default','format':{'type':'image/tiff'}}]},'evalscript':EVALSCRIPT}
    r=requests.post(config['sentinel']['process_url'],headers={'Authorization':f'Bearer {token}'},json=payload,timeout=90);r.raise_for_status()
    if len(r.content)>40_000_000:raise RuntimeError('bounded optical response exceeded 40 MB')
    with rasterio.MemoryFile(r.content) as mem:
        with mem.open() as ds:
            if ds.count!=6 or ds.crs.to_epsg()!=32748 or ds.width!=width or ds.height!=height:raise RuntimeError('CDSE response grid/bands differ from requested projected grid')
            return ds.read(),{'transform':ds.transform,'crs':str(ds.crs),'width':width,'height':height,'scene_id':scene['id'],'datetime':scene['properties']['datetime'],'cloud_percent':scene['properties'].get('eo:cloud_cover')}

def _rgb(data:np.ndarray) -> Image.Image:
    # Fixed stretch for both dates; display-only transform, separate from reflectance analysis.
    rgb=np.stack([data[2],data[1],data[0]],axis=-1)
    return Image.fromarray(np.uint8(np.clip((rgb-.02)/.23,0,1)*255),'RGB')

def process_area(config:dict,token:str,area:dict,out:pathlib.Path,pair:tuple[dict,dict]) -> dict:
    box=area['bbox_wgs84'];baseline,current=pair
    before,meta_before=fetch_scene(config,token,box,baseline);after,meta_after=fetch_scene(config,token,box,current)
    if before.shape!=after.shape or meta_before['transform']!=meta_after['transform']:raise RuntimeError('optical scenes do not share an exact grid')
    # The study square is not a coral habitat map. Results are labelled accordingly.
    mask=np.ones(before.shape[1:],dtype=bool)
    settings=config['sentinel']
    result=analyze_pair(before[:4],after[:4],before[4],after[4],before[5],after[5],mask,settings['min_valid_overlap'],settings['max_median_brightness_shift'],settings['candidate_z'],settings['min_component_pixels'],settings['cloud_buffer_px'],settings['max_square_cloud_fraction'])
    out.mkdir(parents=True,exist_ok=True)
    _rgb(before).save(out/'before.png');_rgb(after).save(out/'after.png')
    diff=np.nanmedian(np.abs(result['difference'][:3]),axis=0)
    overlay=np.zeros((*diff.shape,4),dtype=np.uint8);overlay[:,:,0]=240;overlay[:,:,1]=120;overlay[:,:,3]=np.uint8(np.clip(diff/.12,0,1)*160*result['valid'])
    Image.fromarray(overlay,'RGBA').save(out/'difference.png')
    polygons=[]
    if result['candidate'].any():
        for geom,value in shapes(result['candidate'].astype('uint8'),mask=result['candidate'],transform=meta_before['transform']):
            if value:polygons.append(transform_geom('EPSG:32748','EPSG:4326',geom))
    return {'state':result['state'],'area':area['code'],'lon':(box[0]+box[2])/2,'lat':(box[1]+box[3])/2,'source_asset_ids':[baseline['id'],current['id']],'source_url':'https://browser.dataspace.copernicus.eu/','observed_start':meta_before['datetime'],'observed_end':meta_after['datetime'],'coverage_fraction':result['coverage_fraction'],'quality_flags':result['flags']+([result['state']] if result['state']!='published' else [])+['habitat_mask_unavailable','tide_depth_turbidity_unresolved'],'metrics':{'candidate_pixel_count':result.get('candidate_pixel_count',0),'candidate_polygons':polygons,'baseline_cloud_percent':meta_before['cloud_percent'],'current_cloud_percent':meta_after['cloud_percent'],'square_cloud_fraction_before':result['square_cloud_fraction_before'],'square_cloud_fraction_after':result['square_cloud_fraction_after'],'cloud_buffer_m':settings['cloud_buffer_px']*settings['output_pixel_m'],'projected_crs':'EPSG:32748','pixel_size_m':config['sentinel']['output_pixel_m']},'limitations':'Coastal optical change in a reef study area only. No verified coral habitat mask, tide/depth/water-column correction or field diagnosis; differences cannot establish coral damage.','artifacts':{'before':out/'before.png','after':out/'after.png','difference':out/'difference.png'},'algorithm_version':VERSION}
