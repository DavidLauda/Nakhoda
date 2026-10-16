"""Measured 0.01-degree pilot grid from Sentinel-3 SST and OLCI chlorophyll.

Cells without both quality-screened observations stay empty. No coarse grid is
interpolated or divided to manufacture detail.
"""
from __future__ import annotations

import numpy as np
import xarray as xr

from pipeline.analysis.environment import environmental_index


VERSION = 'environment-index-highres-v0.2'
RESOLUTION_DEGREES = 0.01
MIN_CHL_PIXELS = 2
MAX_CHL_UNCERTAINTY_PERCENT = 60
MIN_WATER_FRACTION = 0.8
MIN_SST_QUALITY = 4
# GHRSST L2P bits: land, ice, lake, river, cloud.
BAD_SST_FLAGS = 2 | 4 | 8 | 16 | 512


def edges(bbox: list[float]) -> tuple[np.ndarray, np.ndarray]:
    west, south, east, north = bbox
    lon = np.arange(west, east + RESOLUTION_DEGREES / 2, RESOLUTION_DEGREES)
    lat = np.arange(south, north + RESOLUTION_DEGREES / 2, RESOLUTION_DEGREES)
    if abs(lon[-1] - east) > 1e-7 or abs(lat[-1] - north) > 1e-7:
        raise ValueError('Pilot bbox must align with the 0.01-degree grid')
    return lat, lon


def _binned(lat: np.ndarray, lon: np.ndarray, selected: np.ndarray,
            lat_edges: np.ndarray, lon_edges: np.ndarray,
            values: np.ndarray | None = None) -> np.ndarray:
    weights = None if values is None else values[selected]
    return np.histogram2d(lat[selected], lon[selected],
                          bins=[lat_edges, lon_edges], weights=weights)[0]


def chlorophyll_grid(ds: xr.Dataset, index: int, bbox: list[float]) -> dict:
    lat_edges, lon_edges = edges(bbox)
    lat, lon = np.meshgrid(ds.latitude.values, ds.longitude.values, indexing='ij')
    chl = np.asarray(ds.CHL.isel(time=index).values, dtype=float)
    uncertainty = np.asarray(ds.CHL_uncertainty.isel(time=index).values, dtype=float)
    flags = np.asarray(ds.flags.isel(time=index).values, dtype=int)
    water = (flags & 1) == 0
    valid = water & np.isfinite(chl) & (chl > 0) & np.isfinite(uncertainty) & (uncertainty <= MAX_CHL_UNCERTAINTY_PERCENT)
    total = _binned(lat, lon, np.ones_like(water, dtype=bool), lat_edges, lon_edges)
    water_count = _binned(lat, lon, water, lat_edges, lon_edges)
    count = _binned(lat, lon, valid, lat_edges, lon_edges)
    summed = _binned(lat, lon, valid, lat_edges, lon_edges, chl)
    fraction = np.divide(water_count, total, out=np.zeros_like(total), where=total > 0)
    marine = (fraction >= MIN_WATER_FRACTION) & (water_count > 0)
    values = np.divide(summed, count, out=np.full_like(summed, np.nan), where=(count >= MIN_CHL_PIXELS) & marine)
    return {'values': values, 'water': marine, 'count': count,
            'time': np.datetime_as_string(ds.time.values[index], unit='s', timezone='UTC')}


def sst_grid(ds: xr.Dataset, bbox: list[float]) -> dict:
    lat_edges, lon_edges = edges(bbox)
    lat = np.asarray(ds.lat.values, dtype=float)
    lon = np.asarray(ds.lon.values, dtype=float)
    temp = np.asarray(ds.sea_surface_temperature.isel(time=0).values, dtype=float)
    quality = np.asarray(ds.quality_level.isel(time=0).values, dtype=int)
    flags = np.asarray(ds.l2p_flags.isel(time=0).values, dtype=int)
    uncertainty = np.asarray(ds.sst_total_uncertainty.isel(time=0).values, dtype=float)
    valid = (np.isfinite(temp) & np.isfinite(uncertainty) & (quality >= MIN_SST_QUALITY)
             & ((flags & BAD_SST_FLAGS) == 0) & (lon >= bbox[0]) & (lon < bbox[2])
             & (lat >= bbox[1]) & (lat < bbox[3]))
    count = _binned(lat, lon, valid, lat_edges, lon_edges)
    summed = _binned(lat, lon, valid, lat_edges, lon_edges, temp - 273.15)
    values = np.divide(summed, count, out=np.full_like(summed, np.nan), where=count > 0)
    return {'values': values, 'count': count,
            'day_fraction': float(np.count_nonzero(valid & ((flags & 128) != 0)) / np.count_nonzero(valid)) if np.any(valid) else None,
            'start': str(ds.attrs.get('time_coverage_start', '')),
            'end': str(ds.attrs.get('time_coverage_end', ''))}


def paired_index(chl: dict, sst: dict, bbox: list[float]) -> dict:
    lat_edges, lon_edges = edges(bbox)
    latitudes = (lat_edges[:-1] + lat_edges[1:]) / 2
    longitudes = (lon_edges[:-1] + lon_edges[1:]) / 2
    result = environmental_index(sst['values'], chl['values'], latitudes, longitudes,
                                 marine_mask=chl['water'], min_cells=20, allow_one_sided=True)
    return {**result, 'latitudes': latitudes, 'longitudes': longitudes,
            'sst_c': sst['values'], 'chl_mg_m3': chl['values'],
            'resolution_degrees': RESOLUTION_DEGREES,
            'paired_cells': int(np.isfinite(sst['values']).__and__(np.isfinite(chl['values'])).sum()),
            'eligible_cells': int(np.count_nonzero(np.isfinite(result['index'])))}
