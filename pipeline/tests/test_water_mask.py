import json
import pathlib
import numpy as np
import pytest

from pipeline.analysis.environment import environmental_index
from pipeline.analysis.water_mask import load_water_mask


ROOT = pathlib.Path(__file__).resolve().parents[1]
CONFIG = json.loads((ROOT / 'config/pilot.json').read_text(encoding='utf8'))


def grid():
    bbox = CONFIG['search_bbox_wgs84']
    resolution = CONFIG['marine']['common_grid_degrees']
    lats = np.arange(bbox[1] + resolution / 2, bbox[3], resolution)
    lons = np.arange(bbox[0] + resolution / 2, bbox[2], resolution)
    return bbox, resolution, lats, lons


def test_jakarta_bay_is_included_and_jakarta_mainland_is_excluded():
    bbox, resolution, lats, lons = grid()
    mask = load_water_mask(ROOT / 'config' / CONFIG['marine_water_mask'], bbox, resolution, lats, lons)
    assert not mask[0].any()  # The southern mainland row.
    assert mask[4].sum() >= 8  # Jakarta Bay, around 5.975 degrees south.
    assert mask[12].sum() >= 8  # Kepulauan Seribu waters.
    y, x = np.mgrid[:len(lats), :len(lons)]
    sst = 28 + 0.02 * x + 0.03 * y + 0.2 * np.sin(x / 3) * np.cos(y / 3)
    chl = 0.2 + 0.01 * x + 0.02 * y + 0.05 * np.sin(x + y)
    result = environmental_index(sst, chl, lats, lons, marine_mask=mask)
    assert result['state'] == 'available'
    assert not np.isfinite(result['index'][~mask]).any()
    assert np.isfinite(result['index'][4:7]).any()  # Measured water reaches the bay.


def test_mask_fails_closed_when_aoi_changes():
    bbox, resolution, lats, lons = grid()
    with pytest.raises(ValueError, match='bbox differs'):
        load_water_mask(ROOT / 'config' / CONFIG['marine_water_mask'],
                        [bbox[0] + 0.05, *bbox[1:]], resolution, lats, lons)
