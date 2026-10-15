"""Experimental relative environmental index. No catch probability is inferred."""
from __future__ import annotations
import math
import numpy as np

VERSION = 'environment-index-v0.3'

def percentile_ranks(values: np.ndarray) -> np.ndarray:
    """Ranks finite values in [0,1], averaging ties; NaN stays NaN."""
    result = np.full(values.shape, np.nan, dtype=float)
    flat = values.ravel(); good = np.flatnonzero(np.isfinite(flat))
    if len(good) < 2: return result
    order = good[np.argsort(flat[good], kind='stable')]
    ranks = np.empty(len(order), dtype=float)
    i = 0
    while i < len(order):
        j = i + 1
        while j < len(order) and flat[order[j]] == flat[order[i]]: j += 1
        ranks[i:j] = ((i + j - 1) / 2) / (len(order) - 1)
        i = j
    result.ravel()[order] = ranks
    return result

def environmental_index(sst_c: np.ndarray, chl_mg_m3: np.ndarray, latitudes: np.ndarray, longitudes: np.ndarray,
                        marine_mask: np.ndarray | None = None, restricted_mask: np.ndarray | None = None,
                        min_cells: int = 20) -> dict:
    if sst_c.shape != chl_mg_m3.shape or sst_c.ndim != 2 or sst_c.shape != (len(latitudes), len(longitudes)):
        raise ValueError('common-grid shape mismatch')
    marine = np.ones(sst_c.shape, dtype=bool) if marine_mask is None else marine_mask.astype(bool)
    restricted = np.zeros(sst_c.shape, dtype=bool) if restricted_mask is None else restricted_mask.astype(bool)
    valid = marine & ~restricted & np.isfinite(sst_c) & np.isfinite(chl_mg_m3) & (chl_mg_m3 > 0)
    empty = np.full(sst_c.shape, np.nan)
    if np.count_nonzero(valid) < min_cells:
        return {'state':'insufficient_valid_cells','index':empty,'front_rank':empty.copy(),'chlorophyll_component':empty.copy(),'eligible':valid}
    gradient = empty.copy()
    for y in range(1,sst_c.shape[0]-1):
        for x in range(1,sst_c.shape[1]-1):
            if not (valid[y,x] and valid[y-1,x] and valid[y+1,x] and valid[y,x-1] and valid[y,x+1]): continue
            dy = abs(float(latitudes[y+1]-latitudes[y-1])) * 111_320
            dx = abs(float(longitudes[x+1]-longitudes[x-1])) * 111_320 * math.cos(math.radians(float(latitudes[y])))
            if dx <= 0 or dy <= 0: continue
            gradient[y,x] = math.hypot((sst_c[y,x+1]-sst_c[y,x-1])/dx,(sst_c[y+1,x]-sst_c[y-1,x])/dy)
    eligible = valid & np.isfinite(gradient)
    if np.count_nonzero(eligible) < min_cells or np.nanmax(gradient)-np.nanmin(gradient) < 1e-12 or np.nanmax(np.log(chl_mg_m3[eligible]))-np.nanmin(np.log(chl_mg_m3[eligible])) < 1e-9:
        return {'state':'insufficient_spatial_variation','index':empty,'front_rank':empty.copy(),'chlorophyll_component':empty.copy(),'eligible':eligible}
    fronts = percentile_ranks(np.where(eligible,gradient,np.nan))
    chl_ranks = percentile_ranks(np.where(eligible,np.log(chl_mg_m3),np.nan))
    component = np.maximum(0,1-np.abs(chl_ranks-0.60)/0.40)
    score = np.where(eligible,np.rint(100*(0.60*fronts+0.40*component)),np.nan)
    return {'state':'available','index':score,'front_rank':fronts,'chlorophyll_component':component,'eligible':eligible}

def publishable_positions(scores: np.ndarray, max_cells: int) -> list[tuple[int,int]]:
    """Keep every measured cell, with an explicit cap on the pilot publication."""
    positions = np.argwhere(np.isfinite(scores))
    if len(positions) > max_cells:
        raise RuntimeError(f'Eligible grid has {len(positions)} cells; bounded publication limit is {max_cells}')
    return [tuple(int(value) for value in position) for position in positions]
