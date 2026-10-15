import numpy as np
from pipeline.analysis.environment import environmental_index, select_markers

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
    assert (4,4) not in select_markers(excluded['index'])
    for y,x in select_markers(original['index']):
        assert np.isfinite(original['index'][y,x])

def test_missing_input_and_constant_grid_do_not_create_score():
    sst,chl,lats,lons=fields()
    missing=environmental_index(sst,np.full_like(chl,np.nan),lats,lons)
    assert missing['state']=='insufficient_valid_cells'
    assert np.isnan(missing['index']).all()
    constant=environmental_index(np.full_like(sst,28),chl,lats,lons)
    assert constant['state']=='insufficient_spatial_variation'

def test_markers_keep_one_cell_spacing():
    sst,chl,lats,lons=fields();result=environmental_index(sst,chl,lats,lons)
    markers=select_markers(result['index'])
    assert len(markers)<=5
    assert all(max(abs(a[0]-b[0]),abs(a[1]-b[1]))>1 for i,a in enumerate(markers) for b in markers[i+1:])
