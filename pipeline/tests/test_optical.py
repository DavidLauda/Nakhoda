import numpy as np
from pipeline.analysis.optical import analyze_pair

def pair():
    rng=np.random.default_rng(42)
    before=rng.uniform(.03,.15,(4,40,40))
    after=before+rng.normal(0,.002,before.shape)
    scl=np.full((40,40),6)
    valid=np.ones((40,40))
    return before,after,scl,valid

def test_cloud_rejection_prevents_candidate_polygons():
    before,after,scl,valid=pair();cloud=scl.copy();cloud[:25,:]=9
    result=analyze_pair(before,after,scl,cloud,valid,valid,np.ones_like(scl,dtype=bool))
    assert result['state']=='insufficient_clear_imagery'
    assert not result['candidate'].any()
    assert 'low_valid_overlap' in result['flags']

def test_localized_signal_is_screened_but_broad_shift_is_suppressed():
    before,after,scl,valid=pair();after[:,10:14,10:14]+=.07
    result=analyze_pair(before,after,scl,scl,valid,valid,np.ones_like(scl,dtype=bool))
    assert result['state']=='published'
    assert result['candidate'].sum()>=9
    after+=.12
    shifted=analyze_pair(before,after,scl,scl,valid,valid,np.ones_like(scl,dtype=bool))
    assert 'broad_brightness_shift' in shifted['flags']
    assert shifted['state']=='insufficient_reference_quality'
    assert not shifted['candidate'].any()

def cloud_edge_pair():
    # A 4x4 SCL cloud in the after scene with an unmasked 2-pixel haze ring around it.
    before,after,scl,valid=pair();cloud=scl.copy();cloud[18:22,18:22]=9
    after[:,16:24,16:24]+=.07;after[:,18:22,18:22]=.5
    return before,after,scl,cloud,valid

def test_cloud_buffer_removes_candidates_adjacent_to_cloud_mask():
    before,after,scl,cloud,valid=cloud_edge_pair();area=np.ones_like(scl,dtype=bool)
    unbuffered=analyze_pair(before,after,scl,cloud,valid,valid,area,cloud_buffer_px=0)
    assert unbuffered['state']=='published' and unbuffered['candidate'].sum()>=9
    buffered=analyze_pair(before,after,scl,cloud,valid,valid,area,cloud_buffer_px=5)
    assert buffered['state']=='published'
    assert not buffered['candidate'].any()
    assert not buffered['valid'][16:24,16:24].any()
    assert buffered['square_cloud_fraction_after']==16/1600 and buffered['square_cloud_fraction_before']==0

def test_clear_pair_still_yields_candidates_with_buffer():
    before,after,scl,valid=pair();after[:,10:14,10:14]+=.07
    result=analyze_pair(before,after,scl,scl,valid,valid,np.ones_like(scl,dtype=bool),cloud_buffer_px=5)
    assert result['state']=='published'
    assert result['candidate'].sum()>=9
    assert result['square_cloud_fraction_before']==result['square_cloud_fraction_after']==0

def test_cloud_in_study_square_publishes_without_candidates():
    before,after,scl,valid=pair();after[:,30:34,30:34]+=.07;cloud=scl.copy();cloud[0:9,0:12]=8
    result=analyze_pair(before,after,scl,cloud,valid,valid,np.ones_like(scl,dtype=bool),cloud_buffer_px=0,max_square_cloud_fraction=.05)
    assert result['square_cloud_fraction_after']>.05
    assert 'cloud_in_study_area' in result['flags']
    assert result['state']=='insufficient_clear_imagery'
    assert not result['candidate'].any()
