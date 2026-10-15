"""Candidate optical-change screening; no coral-condition diagnosis."""
from __future__ import annotations
import numpy as np
from scipy import ndimage

VERSION='optical-change-v0.1'
INVALID_SCL={0,1,2,3,7,8,9,10,11}  # unclassified/cloud/shadow/snow and no data

def analyze_pair(before:np.ndarray, after:np.ndarray, scl_before:np.ndarray, scl_after:np.ndarray,
                 data_before:np.ndarray, data_after:np.ndarray, analysis_mask:np.ndarray,
                 min_overlap:float=.70, max_brightness_shift:float=.08, threshold:float=3, min_pixels:int=9) -> dict:
    if before.shape != after.shape or before.ndim!=3 or before.shape[0]!=4 or scl_before.shape!=before.shape[1:]:
        raise ValueError('aligned 4-band reflectance and SCL arrays required')
    mask=analysis_mask.astype(bool) & (data_before>0) & (data_after>0)
    mask &= ~np.isin(scl_before,list(INVALID_SCL)) & ~np.isin(scl_after,list(INVALID_SCL))
    mask &= np.all(np.isfinite(before)&np.isfinite(after),axis=0)
    mask &= np.all((before>=0)&(before<=1)&(after>=0)&(after<=1),axis=0)
    coverage=float(np.count_nonzero(mask)/max(1,np.count_nonzero(analysis_mask)))
    diff=after-before
    if coverage<min_overlap:
        return {'state':'insufficient_clear_imagery','coverage_fraction':coverage,'flags':['low_valid_overlap'],'valid':mask,'difference':diff,'candidate':np.zeros(mask.shape,dtype=bool)}
    shift=float(np.median(np.mean(diff[:3,mask],axis=0)))
    flags=[]
    if abs(shift)>max_brightness_shift: flags.append('broad_brightness_shift')
    magnitude=np.median(np.abs(diff[:3]),axis=0)
    reference=mask & (magnitude<=np.percentile(magnitude[mask],40))
    if np.count_nonzero(reference)<max(100,int(np.count_nonzero(mask)*.1)): flags.append('insufficient_reference_pixels')
    standardized=np.zeros(mask.shape,dtype=float)
    if 'insufficient_reference_pixels' not in flags:
        per_band=[]
        for band in range(3):
            median=float(np.median(diff[band,reference]));mad=float(np.median(np.abs(diff[band,reference]-median)))
            if mad<1e-4: flags.append('insufficient_reference_variance')
            per_band.append(np.abs(diff[band]-median)/max(1.4826*mad,1e-4))
        standardized=np.median(np.stack(per_band),axis=0)
    candidate=np.zeros(mask.shape,dtype=bool)
    if not flags:
        raw=mask&(standardized>threshold)
        labels,count=ndimage.label(raw,structure=np.ones((3,3),dtype=int))
        sizes=np.bincount(labels.ravel());candidate=raw&(sizes[labels]>=min_pixels)
    state='insufficient_reference_quality' if flags else 'published'
    return {'state':state,'coverage_fraction':coverage,'flags':flags,'valid':mask,'difference':diff,'candidate':candidate,'median_brightness_shift':shift,'candidate_pixel_count':int(candidate.sum())}
