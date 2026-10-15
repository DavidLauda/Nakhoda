"""Official NOAA STAR CRW v3.1 daily NetCDF source."""
from __future__ import annotations
import datetime as dt
import pathlib
import re
import requests
import xarray as xr
import numpy as np

FILE_DATE=re.compile(r'([a-z0-9._-]+_(20\d{6})\.nc)\b',re.I)

def discover_latest_common(session:requests.Session,base_url:str,fields:dict[str,str],year:int|None=None) -> tuple[str,dict[str,str]]:
    year=year or dt.datetime.now(dt.timezone.utc).year
    today=dt.datetime.now(dt.timezone.utc).strftime('%Y%m%d')
    products={}
    for field,directory in fields.items():
        url=f'{base_url}/{directory}/{year}/'
        response=session.get(url,timeout=25);response.raise_for_status()
        dated={date:f'{url}{name}' for name,date in FILE_DATE.findall(response.text) if date<=today}
        if not dated: raise RuntimeError(f'NOAA directory has no current-year NetCDF for {field}: {url}')
        products[field]=dated
    common=set.intersection(*(set(x) for x in products.values()))
    if not common: raise RuntimeError('NOAA fields have no common acquisition date')
    for date in sorted(common,reverse=True)[:7]:
        urls={field:values[date] for field,values in products.items()}
        try:
            if all((r:=session.head(url,timeout=15,allow_redirects=True)).status_code==200 and int(r.headers.get('Content-Length','1'))>0 for url in urls.values()):
                return date,urls
        except requests.RequestException:
            continue
    raise RuntimeError('NOAA listed assets are not downloadable for the last seven common dates')

def download_capped(session:requests.Session,url:str,path:pathlib.Path,max_bytes:int=30_000_000) -> pathlib.Path:
    path.parent.mkdir(parents=True,exist_ok=True)
    if path.exists() and path.stat().st_size>0:return path
    with session.get(url,timeout=90,stream=True) as response:
        response.raise_for_status()
        size=0
        with path.open('wb') as stream:
            for chunk in response.iter_content(65536):
                size+=len(chunk)
                if size>max_bytes:raise RuntimeError(f'NOAA file exceeds bounded download: {url}')
                stream.write(chunk)
    return path

def extract_point(path:pathlib.Path,lon:float,lat:float,field:str) -> dict:
    # Read packed values explicitly. Some categorical uint8 NOAA alerts fail CF auto masking
    # in newer xarray/NumPy combinations when NaN is assigned to an integer array.
    with xr.open_dataset(path,mask_and_scale=False,decode_times=True) as ds:
        lat_name=next((n for n in ('lat','latitude') if n in ds.coords),None)
        lon_name=next((n for n in ('lon','longitude') if n in ds.coords),None)
        if not lat_name or not lon_name:raise RuntimeError(f'NOAA coordinates missing in {path.name}')
        candidates=[v for v in ds.data_vars if lat_name in ds[v].dims and lon_name in ds[v].dims]
        preferred={'sst':['sst','analysed_sst','sea_surface_temperature'], 'hotspot':['hotspot','hs'], 'dhw':['dhw','degree_heating_week'], 'alert_7day':['baa','bleaching_alert_area','baa5-max-7d']}[field]
        selected=next((v for v in candidates if v.lower() in preferred),None)
        if selected is None and len(candidates)==1:selected=candidates[0]
        if selected is None:raise RuntimeError(f'NOAA variable ambiguous: {candidates} in {path.name}')
        arr=ds[selected].sel({lon_name:lon,lat_name:lat},method='nearest').squeeze()
        if arr.size!=1:raise RuntimeError('NOAA unexpected extra dimension')
        raw=float(arr.values)
        attrs=ds[selected].attrs
        fill=attrs.get('_FillValue',attrs.get('missing_value'))
        if (fill is not None and raw==float(fill)) or not np.isfinite(raw):raise RuntimeError(f'NOAA missing {field} at {lon},{lat}')
        if 'valid_min' in attrs and raw<float(attrs['valid_min']):raise RuntimeError(f'NOAA {field} below valid_min')
        if 'valid_max' in attrs and raw>float(attrs['valid_max']):raise RuntimeError(f'NOAA {field} above valid_max')
        if 'mask' in ds and int(ds['mask'].sel({lon_name:lon,lat_name:lat},method='nearest').squeeze().values)!=0:raise RuntimeError(f'NOAA {field} grid cell is not valid water')
        value=raw*float(attrs.get('scale_factor',1))+float(attrs.get('add_offset',0))
        units=str(ds[selected].attrs.get('units','')).lower()
        if field=='sst':
            if units in ('k','kelvin'):value-=273.15;units='degree_celsius'
            if units not in ('degree_celsius','degrees_celsius','celsius','degc','°c'):raise RuntimeError(f'NOAA SST units unverified: {units}')
        if field=='dhw' and not ('week' in units or 'wk' in units):raise RuntimeError(f'NOAA DHW units unverified: {units}')
        if field=='hotspot' and not (units in ('degree_celsius','degrees_celsius','celsius','degc','°c')):raise RuntimeError(f'NOAA hotspot units unverified: {units}')
        if field=='alert_7day' and not float(value).is_integer():raise RuntimeError('NOAA alert code is not discrete')
        time_value=str(arr['time'].values) if 'time' in arr.coords else None
        return {'value':round(value,3),'variable':selected,'units':units,'source_time':time_value,'native_lon':float(arr[lon_name]),'native_lat':float(arr[lat_name]),'attributes':{k:str(v) for k,v in ds[selected].attrs.items() if k in ('long_name','standard_name','valid_min','valid_max')}}

def process_latest(config:dict,cache:pathlib.Path,selection:tuple[str,dict[str,str]]|None=None) -> list[dict]:
    source=config['noaa'];s=requests.Session();date,urls=selection or discover_latest_common(s,source['base_url'],source['fields'])
    paths={field:download_capped(s,url,cache/pathlib.Path(url).name) for field,url in urls.items()}
    date_iso=dt.datetime.strptime(date,'%Y%m%d').replace(tzinfo=dt.timezone.utc).isoformat()
    observations=[]
    for aoi in config['reef_study_areas']:
        box=aoi['bbox_wgs84'];lon=(box[0]+box[2])/2;lat=(box[1]+box[3])/2
        try:metrics={field:extract_point(path,lon,lat,field) for field,path in paths.items()}
        except RuntimeError as exc:
            observations.append({'area':aoi['code'],'state':'unavailable','reason':str(exc),'date':date,'urls':urls});continue
        source_time=metrics['sst']['source_time']
        observed_end=dt.datetime.fromisoformat(source_time).replace(tzinfo=dt.timezone.utc).isoformat() if source_time else date_iso
        metrics['alert_7day']['observed_start']=(dt.datetime.fromisoformat(observed_end)-dt.timedelta(days=6)).isoformat()
        metrics['alert_7day']['observed_end']=observed_end
        observations.append({'area':aoi['code'],'state':'published','lon':lon,'lat':lat,'observed_start':metrics['alert_7day']['observed_start'],'observed_end':observed_end,'metrics':metrics,'urls':urls,'source_asset_ids':[pathlib.Path(u).name for u in urls.values()],'coverage_fraction':1.0,'quality_flags':['grid_point_context_not_reef_scale'],'limitations':'NOAA 0.05° heat stress is regional context, not direct evidence of bleaching at the reef. Alert is an official 7-day maximum composite; SST, HotSpot and DHW are daily.'})
    return observations
