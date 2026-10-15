"""Load a fixed, source-traced water grid; fail closed when its AOI changes."""
from __future__ import annotations

import json
import pathlib
import numpy as np


def load_water_mask(path: pathlib.Path, bbox: list[float], resolution: float,
                    latitudes: np.ndarray, longitudes: np.ndarray) -> np.ndarray:
    data = json.loads(path.read_text(encoding='utf8'))
    if not np.allclose(data['bbox_wgs84'], bbox, rtol=0, atol=1e-9):
        raise ValueError('Water mask bbox differs from Marine AOI; regenerate the mask')
    if not np.isclose(data['resolution_degrees'], resolution, rtol=0, atol=1e-9):
        raise ValueError('Water mask resolution differs from Marine grid')
    expected_lats = np.arange(bbox[1] + resolution / 2, bbox[3], resolution)
    expected_lons = np.arange(bbox[0] + resolution / 2, bbox[2], resolution)
    if (not np.array_equal(latitudes, expected_lats) or
            not np.array_equal(longitudes, expected_lons)):
        raise ValueError('Water mask coordinates differ from Marine grid')
    rows = data['water_rows_south_to_north']
    if len(rows) != len(latitudes) or any(len(row) != len(longitudes) or set(row) - {'0', '1'} for row in rows):
        raise ValueError('Water mask grid dimensions or cell values are invalid')
    mask = np.array([[character == '1' for character in row] for row in rows], dtype=bool)
    if not np.any(mask):
        raise ValueError('Water mask has no sea cells')
    return mask
