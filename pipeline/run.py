"""Daily discovery and bounded publication; failures remain source-specific."""
from __future__ import annotations
import argparse
import datetime as dt
import json
import os
import pathlib
import traceback
import numpy as np
from pipeline.analysis.environment import VERSION as ENV_VERSION,environmental_index,publishable_positions
from pipeline.providers import noaa,marine,sentinel
from pipeline.publish import Publisher,stable_key

ROOT=pathlib.Path(__file__).resolve().parent
CONFIG=json.loads((ROOT/'config/pilot.json').read_text(encoding='utf8'))
OUT=ROOT/'out';OUT.mkdir(exist_ok=True)

def now()->str:return dt.datetime.now(dt.timezone.utc).isoformat()
def run_record(pub:Publisher|None,source:str,key:str,status:str,error:str|None=None,latest:str|None=None)->str|None:
    if pub is None:return None
    prior=pub.table('analysis_runs',{'select':'id,started_at,latest_usable_observation_at,latest_published_result_at','run_key':f'eq.{key}','limit':1})
    previous=prior[0] if prior else {}
    row={'run_key':key,'source_name':source,'job_url':os.getenv('GITHUB_RUN_URL'),'status':status,'started_at':previous.get('started_at') or now(),'ended_at':now() if status!='running' else None,'latest_check_at':now(),'latest_available_observation_at':latest,'latest_usable_observation_at':latest if status=='success' else previous.get('latest_usable_observation_at'),'latest_published_result_at':now() if status=='success' else previous.get('latest_published_result_at'),'error_code':error}
    return pub.upsert('analysis_runs',row,'run_key')[0]['id']

def publish_observation(pub:Publisher,result:dict,source:str,product:str,key:str,algorithm:str,run_id:str|None,area_id:str,resolution:str):
    fetched=now();artifacts=[]
    for kind,path in result.get('artifacts',{}).items():artifacts.append(pub.upload(kind,path,f'{key}/{kind}{path.suffix}'))
    manifest={'artifact_keys':{a['kind']:a['storage_key'] for a in artifacts},'before_at':result.get('observed_start'),'after_at':result.get('observed_end')}
    row={'result_key':key,'type':'heat_stress' if source=='NOAA CRW' else 'optical_change','area_id':area_id,'lon':result['lon'],'lat':result['lat'],'source_name':source,'source_product_id':product,'source_asset_ids':result['source_asset_ids'],'source_url':result['source_url'],'observed_start':result['observed_start'],'observed_end':result['observed_end'],'fetched_at':fetched,'processed_at':now(),'native_resolution':resolution,'output_resolution':resolution if source=='NOAA CRW' else '10 m UTM 48S','algorithm_version':algorithm,'parameters_hash':stable_key(CONFIG['aoi_version'],algorithm,json.dumps(CONFIG.get('sentinel' if source=='CDSE Sentinel-2' else 'noaa'),sort_keys=True)),'quality_flags':result.get('quality_flags',[]),'coverage_fraction':result.get('coverage_fraction'),'metrics':result.get('metrics',{}),'limitations':result['limitations'],'state':result['state'],'run_id':run_id,'manifest':manifest}
    observation=pub.upsert('observations',row,'result_key')[0]
    for artifact in artifacts:pub.upsert('analysis_artifacts',{'observation_id':observation['id'],**artifact},'observation_id,kind')
    return observation['id']

def run_noaa(pub:Publisher|None):
    import requests
    date,urls=noaa.discover_latest_common(requests.Session(),CONFIG['noaa']['base_url'],CONFIG['noaa']['fields'])
    key=stable_key('NOAA',CONFIG['aoi_version'],date,'crw-heat-v0.1')
    if pub and all(pub.exists(stable_key(key,area['code'])) for area in CONFIG['reef_study_areas']):
        run_record(pub,'NOAA CRW',stable_key(key,'check',dt.datetime.now(dt.timezone.utc).date()),'no_new_data');return {'status':'no_new_data','date':date}
    observations=noaa.process_latest(CONFIG,OUT/'noaa-cache',(date,urls));area_id=pub.pilot_area() if pub else None;run_id=run_record(pub,'NOAA CRW',key,'running')
    published=[]
    source_at=next((item['observed_end'] for item in observations if item['state']=='published'),dt.datetime.strptime(date,'%Y%m%d').replace(tzinfo=dt.timezone.utc).isoformat())
    for field,url in urls.items():
        if pub:pub.upsert('source_assets',{'source_name':'NOAA CRW','product_id':CONFIG['noaa']['product_id'],'asset_id':pathlib.Path(url).name,'source_url':url,'observed_start':source_at,'observed_end':source_at,'native_resolution':'0.05 degree / ~5 km','quality_flags':[]},'source_name,product_id,asset_id')
    for item in observations:
        if item['state']!='published':continue
        item['source_url']='https://coralreefwatch.noaa.gov/product/5km/'
        item['observed_start']=item['metrics']['alert_7day']['observed_start']
        if pub:published.append(publish_observation(pub,item,'NOAA CRW',CONFIG['noaa']['product_id'],stable_key(key,item['area']),'crw-heat-v0.1',run_id,area_id,'0.05 degree / ~5 km'))
    (OUT/'noaa-discovery.json').write_text(json.dumps({'date':date,'assets':urls,'areas':[{k:v for k,v in x.items() if k!='urls'} for x in observations]},indent=2,default=str),encoding='utf8')
    if pub:run_record(pub,'NOAA CRW',key,'success' if published else 'failed',None if published else 'no_usable_reef_grid_cell',latest=dt.datetime.strptime(date,'%Y%m%d').replace(tzinfo=dt.timezone.utc).isoformat())
    return {'status':'success' if published else ('processed_locally_not_published' if not pub else 'failed'),'date':date,'published':published,'areas':len(observations)}

def run_marine(pub:Publisher|None):
    key=stable_key('Marine',CONFIG['aoi_version'],dt.datetime.now(dt.timezone.utc).date(),ENV_VERSION)
    if pub and pub.table('analysis_runs',{'select':'status','run_key':f'eq.{key}'}) and pub.table('analysis_runs',{'select':'status','run_key':f'eq.{key}'})[0]['status']=='success':return {'status':'no_new_data'}
    files=marine.subset_pair(CONFIG,OUT/'marine-cache');grid=marine.read_common_grid(*files,CONFIG)
    result=environmental_index(grid['sst_c'],grid['chl_mg_m3'],grid['latitudes'],grid['longitudes'],min_cells=CONFIG['environment']['min_valid_cells'])
    source_ids=[f'{CONFIG["marine"]["sst_dataset_id"]}@{grid["sst_time"]}',f'{CONFIG["marine"]["chlorophyll_dataset_id"]}@{grid["chl_time"]}']
    run_id=run_record(pub,'Copernicus Marine',key,'running')
    cells=[]
    if result['state']=='available':
        area_id=pub.pilot_area() if pub else None;res=grid['resolution_degrees']
        for y,x in publishable_positions(result['index'],CONFIG['environment']['max_published_cells']):
            lon=float(grid['longitudes'][x]);lat=float(grid['latitudes'][y]);half=res/2
            cell={'result_key':stable_key(source_ids,CONFIG['aoi_version'],ENV_VERSION,y,x),'area_id':area_id,'geom':f'SRID=4326;POLYGON(({lon-half} {lat-half},{lon+half} {lat-half},{lon+half} {lat+half},{lon-half} {lat+half},{lon-half} {lat-half}))','lon':lon,'lat':lat,'observed_start':min(grid['sst_time'],grid['chl_time']),'observed_end':max(grid['sst_time'],grid['chl_time']),'source_asset_ids':source_ids,'sst_c':float(grid['sst_c'][y,x]),'chlorophyll_mg_m3':float(grid['chl_mg_m3'][y,x]),'front_rank':float(result['front_rank'][y,x]),'chlorophyll_component':float(result['chlorophyll_component'][y,x]),'index_score':int(result['index'][y,x]),'algorithm_version':ENV_VERSION,'resolution':f'{res} degree (~5.5 km)','quality_flags':['zoning_unverified','chlorophyll_gapfilled_l4'],'exclusion':None,'zoning_verified':False}
            cells.append(cell)
        if pub:
            for id_,dataset,url in [(source_ids[0],CONFIG['marine']['sst_product_id'],'https://data.marine.copernicus.eu/product/SST_GLO_SST_L4_NRT_OBSERVATIONS_010_001/services'),(source_ids[1],CONFIG['marine']['chlorophyll_product_id'],'https://data.marine.copernicus.eu/product/OCEANCOLOUR_GLO_BGC_L4_NRT_009_102/services')]:pub.upsert('source_assets',{'source_name':'Copernicus Marine','product_id':dataset,'asset_id':id_,'source_url':url,'observed_start':min(grid['sst_time'],grid['chl_time']),'observed_end':max(grid['sst_time'],grid['chl_time']),'native_resolution':'0.05 degree SST / 4 km CHL','quality_flags':[]},'source_name,product_id,asset_id')
            pub.upsert('environment_cells',cells,'result_key')
    (OUT/'environment-discovery.json').write_text(json.dumps({'state':result['state'],'source_ids':source_ids,'units':{'sst':'degree_celsius','chlorophyll':'mg m-3'},'cells':[{k:v for k,v in c.items() if k!='area_id'} for c in cells]},indent=2),encoding='utf8')
    if pub:run_record(pub,'Copernicus Marine',key,'success' if cells else 'failed',None if cells else result['state'],latest=max(grid['sst_time'],grid['chl_time']))
    return {'status':'success' if cells and pub else ('processed_locally_not_published' if cells else result['state']),'cells':len(cells),'sources':source_ids}

def run_sentinel(pub:Publisher|None):
    token=sentinel.oauth_token(CONFIG);area_id=pub.pilot_area() if pub else None;results=[]
    for area in CONFIG['reef_study_areas']:
        try:
            pair=sentinel.choose_pair(CONFIG,token,area['bbox_wgs84'])
            key=stable_key('S2',CONFIG['aoi_version'],area['code'],pair[0]['id'],pair[1]['id'],sentinel.VERSION)
            if pub and pub.exists(key):results.append({'area':area['code'],'status':'no_new_data'});continue
            run_id=run_record(pub,'CDSE Sentinel-2',key,'running')
            item=sentinel.process_area(CONFIG,token,area,OUT/'optical'/area['code'],pair)
            for scene in pair:
                if pub:pub.upsert('source_assets',{'source_name':'CDSE Sentinel-2','product_id':CONFIG['sentinel']['product_id'],'asset_id':scene['id'],'source_url':'https://browser.dataspace.copernicus.eu/','observed_start':scene['properties']['datetime'],'observed_end':scene['properties']['datetime'],'native_resolution':'10 m B02/B03/B04/B08; 20 m SCL','quality_flags':[f'catalog_cloud_percent:{scene["properties"].get("eo:cloud_cover")}']},'source_name,product_id,asset_id')
            if pub:publish_observation(pub,item,'CDSE Sentinel-2',CONFIG['sentinel']['product_id'],key,sentinel.VERSION,run_id,area_id,'10 m visible/NIR, 20 m SCL')
            run_record(pub,'CDSE Sentinel-2',key,'success' if item['state']=='published' else 'insufficient_quality',item['state'] if item['state']!='published' else None,latest=item['observed_end']);results.append({'area':area['code'],'status':item['state'] if pub else 'processed_locally_not_published','quality_state':item['state'],'source_asset_ids':item['source_asset_ids'],'quality_flags':item['quality_flags']})
        except Exception as exc:
            key=stable_key('S2',CONFIG['aoi_version'],area['code'],dt.datetime.now(dt.timezone.utc).date())
            run_record(pub,'CDSE Sentinel-2',key,'failed',type(exc).__name__)
            results.append({'area':area['code'],'status':'failed','error':str(exc)})
    (OUT/'optical-discovery.json').write_text(json.dumps(results,indent=2),encoding='utf8')
    return results

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--source',choices=['all','noaa','marine','sentinel'],default='all');args=parser.parse_args()
    try:pub=Publisher()
    except RuntimeError:pub=None
    results={};failed=False
    for name,run in [('noaa',run_noaa),('marine',run_marine),('sentinel',run_sentinel)]:
        if args.source not in ('all',name):continue
        try:results[name]=run(pub)
        except Exception as exc:
            failed=True;results[name]={'status':'failed','error_code':type(exc).__name__,'message':str(exc)}
            run_record(pub,{'noaa':'NOAA CRW','marine':'Copernicus Marine','sentinel':'CDSE Sentinel-2'}[name],stable_key(name,dt.datetime.now(dt.timezone.utc).date()),'failed',type(exc).__name__)
    print(json.dumps({'published_to_supabase':bool(pub),'sources':results},indent=2,default=str))
    if failed:raise SystemExit(1)

if __name__=='__main__':main()
