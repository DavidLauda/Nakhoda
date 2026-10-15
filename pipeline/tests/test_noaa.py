import pathlib
import numpy as np
import xarray as xr
from pipeline.providers.noaa import extract_point
from pipeline.publish import stable_key

def test_cf_units_fill_and_asset_key(tmp_path:pathlib.Path):
    path=tmp_path/'coraltemp_v3.1_20261012.nc'
    xr.Dataset({'sst':(('lat','lon'),np.array([[299.15,np.nan]],dtype='float32'),{'units':'kelvin'})},coords={'lat':[-5.75],'lon':[106.6,106.65]}).to_netcdf(path)
    field=extract_point(path,106.6,-5.75,'sst')
    assert abs(field['value']-26.0)<.001
    assert field['native_lon']==106.6
    assert stable_key('asset','aoi','v1')==stable_key('asset','aoi','v1')
    assert stable_key('asset','aoi','v1')!=stable_key('asset','aoi','v2')
