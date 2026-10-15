"""Bounded Copernicus Marine subset adapter for real SST and chlorophyll."""
from __future__ import annotations
import datetime as dt
import pathlib
import numpy as np
import xarray as xr
import copernicusmarine

def subset_pair(config:dict,output:pathlib.Path) -> tuple[pathlib.Path,pathlib.Path]:
    product=config['marine'];box=config['search_bbox_wgs84'];output.mkdir(parents=True,exist_ok=True)
    # Seven days are enough to find a compatible pair while keeping the request small.
    end=dt.datetime.now(dt.timezone.utc).date();start=end-dt.timedelta(days=10)
    files=[]
    for label,dataset,variable in [('sst',product['sst_dataset_id'],product['sst_variable']),('chl',product['chlorophyll_dataset_id'],product['chlorophyll_variable'])]:
        filename=f'{label}_{start}_{end}.nc';path=output/filename
        if not path.exists():
            copernicusmarine.subset(dataset_id=dataset,variables=[variable],minimum_longitude=box[0],maximum_longitude=box[2],minimum_latitude=box[1],maximum_latitude=box[3],start_datetime=str(start),end_datetime=str(end),output_filename=filename,output_directory=str(output),force_download=True)
        files.append(path)
    return files[0],files[1]

def _time_slice(ds:xr.Dataset,var:str) -> tuple[np.datetime64,xr.DataArray]:
    if var not in ds:raise RuntimeError(f'Expected provider variable missing: {var}; actual {list(ds.data_vars)}')
    field=ds[var]
    if 'time' not in field.dims:raise RuntimeError(f'{var} has no time dimension')
    time=field['time'].values[-1]
    return time,field.isel(time=-1).squeeze()

def read_common_grid(sst_path:pathlib.Path,chl_path:pathlib.Path,config:dict) -> dict:
    setting=config['marine'];resolution=float(setting['common_grid_degrees']);box=config['search_bbox_wgs84']
    with xr.open_dataset(sst_path,mask_and_scale=True) as sst_ds, xr.open_dataset(chl_path,mask_and_scale=True) as chl_ds:
        sst_time,sst=_time_slice(sst_ds,setting['sst_variable']);chl_time,chl=_time_slice(chl_ds,setting['chlorophyll_variable'])
        hours=abs(float((sst_time-chl_time)/np.timedelta64(1,'h')))
        if hours>setting['max_interval_hours']:raise RuntimeError(f'SST/chlorophyll intervals differ by {hours:.1f} h')
        units=str(sst.attrs.get('units','')).lower()
        if units not in ('kelvin','k'):raise RuntimeError(f'Unexpected SST units: {units}')
        chl_units=str(chl.attrs.get('units','')).lower()
        if chl_units not in ('mg m-3','mg/m3','mg m^-3','mg m**-3','milligram m-3','mg m−3'):raise RuntimeError(f'Unexpected CHL units: {chl_units}')
        lats=np.arange(box[1]+resolution/2,box[3],resolution)
        lons=np.arange(box[0]+resolution/2,box[2],resolution)
        # The common grid is the 0.05-degree SST grid. CHL is averaged by native cell centers inside each cell;
        # no detailed chlorophyll surface is invented by upsampling.
        sst_values=np.full((len(lats),len(lons)),np.nan);chl_values=np.full_like(sst_values,np.nan)
        sst_lat='lat' if 'lat' in sst.coords else 'latitude';sst_lon='lon' if 'lon' in sst.coords else 'longitude'
        chl_lat='lat' if 'lat' in chl.coords else 'latitude';chl_lon='lon' if 'lon' in chl.coords else 'longitude'
        for y,lat in enumerate(lats):
            for x,lon in enumerate(lons):
                temp=float(sst.sel({sst_lat:lat,sst_lon:lon},method='nearest').values)
                if np.isfinite(temp):sst_values[y,x]=temp-273.15
                tile=chl.where((chl[chl_lat]>=lat-resolution/2)&(chl[chl_lat]<lat+resolution/2)&(chl[chl_lon]>=lon-resolution/2)&(chl[chl_lon]<lon+resolution/2),drop=True)
                values=np.asarray(tile.values,dtype=float)
                if values.size and np.isfinite(values).any():chl_values[y,x]=float(np.nanmean(values))
        return {'sst_c':sst_values,'chl_mg_m3':chl_values,'latitudes':lats,'longitudes':lons,'sst_time':np.datetime_as_string(sst_time,unit='s',timezone='UTC'),'chl_time':np.datetime_as_string(chl_time,unit='s',timezone='UTC'),'sst_units':units,'chl_units':chl_units,'resolution_degrees':resolution,'source_ids':[sst_path.name,chl_path.name]}
