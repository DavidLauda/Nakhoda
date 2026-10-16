"""Experimental relative environmental index. No catch probability is inferred."""
from __future__ import annotations
import math
import numpy as np

VERSION = 'environment-index-v0.4'

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
                        min_cells: int = 20, allow_one_sided: bool = False) -> dict:
    if sst_c.shape != chl_mg_m3.shape or sst_c.ndim != 2 or sst_c.shape != (len(latitudes), len(longitudes)):
        raise ValueError('common-grid shape mismatch')
    marine = np.ones(sst_c.shape, dtype=bool) if marine_mask is None else marine_mask.astype(bool)
    restricted = np.zeros(sst_c.shape, dtype=bool) if restricted_mask is None else restricted_mask.astype(bool)
    valid = marine & ~restricted & np.isfinite(sst_c) & np.isfinite(chl_mg_m3) & (chl_mg_m3 > 0)
    empty = np.full(sst_c.shape, np.nan)
    if np.count_nonzero(valid) < min_cells:
        return {'state':'insufficient_valid_cells','index':empty,'front_rank':empty.copy(),'chlorophyll_component':empty.copy(),'eligible':valid}
    gradient = empty.copy()
    one_sided = np.zeros(sst_c.shape, dtype=bool)
    height, width = sst_c.shape
    for y in range(height):
        for x in range(width):
            if not valid[y,x]: continue
            west = x-1 if x > 0 and valid[y,x-1] else x
            east = x+1 if x+1 < width and valid[y,x+1] else x
            south = y-1 if y > 0 and valid[y-1,x] else y
            north = y+1 if y+1 < height and valid[y+1,x] else y
            partial = west == x or east == x or south == y or north == y
            if (partial and not allow_one_sided) or west == east or south == north: continue
            # Only immediate valid neighbours are used; never bridge a missing or land cell.
            dy = abs(float(latitudes[north]-latitudes[south])) * 111_320
            dx = abs(float(longitudes[east]-longitudes[west])) * 111_320 * math.cos(math.radians(float(latitudes[y])))
            if dx <= 0 or dy <= 0: continue
            gradient[y,x] = math.hypot((sst_c[y,east]-sst_c[y,west])/dx,(sst_c[north,x]-sst_c[south,x])/dy)
            one_sided[y,x] = partial
    eligible = valid & np.isfinite(gradient)
    if np.count_nonzero(eligible) < min_cells or np.nanmax(gradient)-np.nanmin(gradient) < 1e-12 or np.nanmax(np.log(chl_mg_m3[eligible]))-np.nanmin(np.log(chl_mg_m3[eligible])) < 1e-9:
        return {'state':'insufficient_spatial_variation','index':empty,'front_rank':empty.copy(),'chlorophyll_component':empty.copy(),'eligible':eligible}
    fronts = percentile_ranks(np.where(eligible,gradient,np.nan))
    chl_ranks = percentile_ranks(np.where(eligible,np.log(chl_mg_m3),np.nan))
    component = np.maximum(0,1-np.abs(chl_ranks-0.60)/0.40)
    score = np.where(eligible,np.rint(100*(0.60*fronts+0.40*component)),np.nan)
    return {'state':'available','index':score,'front_rank':fronts,'chlorophyll_component':component,'eligible':eligible,'one_sided':one_sided}

def publishable_positions(scores: np.ndarray, max_cells: int) -> list[tuple[int,int]]:
    """Keep every measured cell, with an explicit cap on the pilot publication."""
    positions = np.argwhere(np.isfinite(scores))
    if len(positions) > max_cells:
        raise RuntimeError(f'Eligible grid has {len(positions)} cells; bounded publication limit is {max_cells}')
    return [tuple(int(value) for value in position) for position in positions]
