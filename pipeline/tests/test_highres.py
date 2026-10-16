"""High-resolution cells require observed, quality-screened pixels from both feeds."""
import numpy as np
import xarray as xr

from pipeline.analysis.highres import chlorophyll_grid, sst_grid


BBOX = [0.0, 0.0, 0.02, 0.02]


def _chlorophyll() -> xr.Dataset:
    values = np.ones((1, 4, 4), dtype=float)
    return xr.Dataset({
        'CHL': (('time', 'latitude', 'longitude'), values),
        'CHL_uncertainty': (('time', 'latitude', 'longitude'), np.full_like(values, 50)),
        'flags': (('time', 'latitude', 'longitude'), np.zeros_like(values, dtype=np.int8)),
    }, coords={'time': np.array(['2026-10-14'], dtype='datetime64[ns]'),
               'latitude': [.0025, .0075, .0125, .0175],
               'longitude': [.0025, .0075, .0125, .0175]})


def _sst() -> xr.Dataset:
    shape = (1, 2, 2)
    ds = xr.Dataset({
        'sea_surface_temperature': (('time', 'nj', 'ni'), np.full(shape, 300.0)),
        'quality_level': (('time', 'nj', 'ni'), np.full(shape, 5, dtype=np.int8)),
        'l2p_flags': (('time', 'nj', 'ni'), np.zeros(shape, dtype=np.int16)),
        'sst_total_uncertainty': (('time', 'nj', 'ni'), np.full(shape, .4)),
    }, coords={'time': np.array(['2026-10-14'], dtype='datetime64[ns]'),
               'lat': (('nj', 'ni'), [[.005, .005], [.015, .015]]),
               'lon': (('nj', 'ni'), [[.005, .015], [.005, .015]])})
    ds.attrs.update(time_coverage_start='2026-10-14T02:55:48', time_coverage_end='2026-10-14T02:58:48')
    return ds


def test_chlorophyll_does_not_fill_cloud_or_land_gaps():
    ds = _chlorophyll()
    ds['CHL'].values[0, :2, 2:] = np.nan
    ds['flags'].values[0, 2:, :2] = 1
    grid = chlorophyll_grid(ds, 0, BBOX)
    assert np.isfinite(grid['values'][0, 0])
    assert np.isnan(grid['values'][0, 1])
    assert np.isnan(grid['values'][1, 0])
    assert not grid['water'][1, 0]


def test_sst_excludes_low_quality_and_land_flags():
    ds = _sst()
    ds['quality_level'].values[0, 0, 1] = 3
    ds['l2p_flags'].values[0, 1, 0] = 2
    grid = sst_grid(ds, BBOX)
    assert np.isfinite(grid['values'][0, 0])
    assert np.isnan(grid['values'][0, 1])
    assert np.isnan(grid['values'][1, 0])
    assert np.isfinite(grid['values'][1, 1])
