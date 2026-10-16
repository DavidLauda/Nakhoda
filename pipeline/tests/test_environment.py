import numpy as np
import pytest
from pipeline.analysis.environment import environmental_index, publishable_positions

def fields():
    y,x=np.mgrid[:9,:9]
    sst=27 + x*.09 + .22*np.sin(y/2)*np.cos(x/2)
    chl=.2+.04*x+.03*y+.08*np.sin(x+y)
    return sst,chl,np.linspace(-6.1,-5.7,9),np.linspace(106.4,106.8,9)

def test_real_input_changes_reproducible_index_and_excludes_restricted_cell():
    sst,chl,lats,lons=fields()
    original=environmental_index(sst,chl,lats,lons)
    assert original['state']=='available'
    assert np.isfinite(original['index']).sum()>=20
    changed=environmental_index(sst,chl* (1+np.arange(9)[None,:]*.1),lats,lons)
    assert not np.array_equal(original['index'],changed['index'],equal_nan=True)
    restriction=np.zeros_like(sst,dtype=bool);restriction[4,4]=True
    excluded=environmental_index(sst,chl,lats,lons,restricted_mask=restriction)
    assert np.isnan(excluded['index'][4,4])
    assert (4,4) not in publishable_positions(excluded['index'],300)
    for y,x in publishable_positions(original['index'],300):
        assert np.isfinite(original['index'][y,x])

def test_missing_input_and_constant_grid_do_not_create_score():
    sst,chl,lats,lons=fields()
    missing=environmental_index(sst,np.full_like(chl,np.nan),lats,lons)
    assert missing['state']=='insufficient_valid_cells'
    assert np.isnan(missing['index']).all()
    constant=environmental_index(np.full_like(sst,28),chl,lats,lons)
    assert constant['state']=='insufficient_spatial_variation'

def test_every_measured_cell_is_published_with_a_bounded_limit():
    sst,chl,lats,lons=fields();result=environmental_index(sst,chl,lats,lons)
    positions=publishable_positions(result['index'],300)
    assert len(positions)==np.isfinite(result['index']).sum()
    assert (4,4) in positions
    with pytest.raises(RuntimeError,match='bounded publication limit'):
        publishable_positions(result['index'],len(positions)-1)


def test_one_sided_gradient_recovers_observed_cells_without_filling_missing_inputs():
    sst,chl,lats,lons=fields()
    chl[4,5]=np.nan
    strict=environmental_index(sst,chl,lats,lons)
    adaptive=environmental_index(sst,chl,lats,lons,allow_one_sided=True)
    assert np.isnan(strict['index'][4,4])
    assert np.isfinite(adaptive['index'][4,4])
    assert adaptive['one_sided'][4,4]
    assert np.isnan(adaptive['index'][4,5])
    assert not adaptive['one_sided'][2,2]
    # No valid neighbour on either side of the east-west axis: no score.
    chl[4,3]=np.nan
    isolated=environmental_index(sst,chl,lats,lons,allow_one_sided=True)
    assert np.isnan(isolated['index'][4,4])


def test_one_sided_gradient_never_crosses_restricted_or_land_cells():
    sst,chl,lats,lons=fields()
    water=np.ones(sst.shape,dtype=bool)
    water[4,3]=False;water[4,5]=False
    result=environmental_index(sst,chl,lats,lons,marine_mask=water,allow_one_sided=True)
    assert np.isnan(result['index'][4,4])
    assert np.isnan(result['index'][4,3])
