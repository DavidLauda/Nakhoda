"""Candidate optical-change screening; no coral-condition diagnosis."""
from __future__ import annotations
import numpy as np
from scipy import ndimage

VERSION='optical-change-v0.2'
INVALID_SCL={0,1,2,3,7,8,9,10,11}  # unclassified/cloud/shadow/snow and no data
CLOUD_SCL={3,8,9,10}  # cloud shadow, medium/high-probability cloud, thin cirrus

def cloud_mask(scl:np.ndarray) -> np.ndarray:
    return np.isin(scl,list(CLOUD_SCL))

def buffer_mask(mask:np.ndarray, radius:int) -> np.ndarray:
    # SCL misses thin cloud edges and haze; a disk buffer also removes the adjacent pixels.
    if radius<=0 or not mask.any(): return mask.copy()
    y,x=np.ogrid[-radius:radius+1,-radius:radius+1]
    return ndimage.binary_dilation(mask,structure=(x*x+y*y)<=radius*radius)

def analyze_pair(before:np.ndarray, after:np.ndarray, scl_before:np.ndarray, scl_after:np.ndarray,
                 data_before:np.ndarray, data_after:np.ndarray, analysis_mask:np.ndarray,
                 min_overlap:float=.70, max_brightness_shift:float=.08, threshold:float=3, min_pixels:int=9,
                 cloud_buffer_px:int=5, max_square_cloud_fraction:float=.05) -> dict:
    if before.shape != after.shape or before.ndim!=3 or before.shape[0]!=4 or scl_before.shape!=before.shape[1:]:
        raise ValueError('aligned 4-band reflectance and SCL arrays required')
    area=analysis_mask.astype(bool)
    mask=area & (data_before>0) & (data_after>0)
    mask &= ~np.isin(scl_before,list(INVALID_SCL)) & ~np.isin(scl_after,list(INVALID_SCL))
    cloud_before,cloud_after=cloud_mask(scl_before),cloud_mask(scl_after)
    # Fraction of the study square SCL classifies as cloud/shadow/cirrus, before buffering.
    square_cloud={'square_cloud_fraction_before':float(np.count_nonzero(cloud_before&area)/max(1,np.count_nonzero(area))),
                  'square_cloud_fraction_after':float(np.count_nonzero(cloud_after&area)/max(1,np.count_nonzero(area)))}
    mask &= ~buffer_mask(cloud_before,cloud_buffer_px) & ~buffer_mask(cloud_after,cloud_buffer_px)
    mask &= np.all(np.isfinite(before)&np.isfinite(after),axis=0)
    mask &= np.all((before>=0)&(before<=1)&(after>=0)&(after<=1),axis=0)
    coverage=float(np.count_nonzero(mask)/max(1,np.count_nonzero(analysis_mask)))
    diff=after-before
    if coverage<min_overlap:
        return {'state':'insufficient_clear_imagery','coverage_fraction':coverage,'flags':['low_valid_overlap'],'valid':mask,'difference':diff,'candidate':np.zeros(mask.shape,dtype=bool),**square_cloud}
    shift=float(np.median(np.mean(diff[:3,mask],axis=0)))
    flags=[]
    if max(square_cloud.values())>max_square_cloud_fraction: flags.append('cloud_in_study_area')
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
    state='insufficient_clear_imagery' if 'cloud_in_study_area' in flags else 'insufficient_reference_quality' if flags else 'published'
    return {'state':state,'coverage_fraction':coverage,'flags':flags,'valid':mask,'difference':diff,'candidate':candidate,'median_brightness_shift':shift,'candidate_pixel_count':int(candidate.sum()),**square_cloud}
