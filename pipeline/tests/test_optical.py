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
