"""Regenerate the committed sea-cell mask from Natural Earth 10m land polygons.

Download https://naturalearth.s3.amazonaws.com/10m_physical/ne_10m_land.zip
then run: python scripts/generate_marine_water_mask.py PATH_TO_ZIP
Generation needs pyshp and shapely locally; the pipeline only reads the JSON output.
"""
from __future__ import annotations

import hashlib
import io
import json
import pathlib
import sys
import zipfile

import numpy as np
import shapefile
from shapely.geometry import box, shape
from shapely.ops import unary_union


ROOT = pathlib.Path(__file__).resolve().parents[1]
CONFIG = json.loads((ROOT / 'pipeline/config/pilot.json').read_text(encoding='utf8'))
SOURCE_URL = 'https://naturalearth.s3.amazonaws.com/10m_physical/ne_10m_land.zip'


def main(source: pathlib.Path) -> None:
    bbox = CONFIG['search_bbox_wgs84']
    resolution = float(CONFIG['marine']['common_grid_degrees'])
    lats = np.arange(bbox[1] + resolution / 2, bbox[3], resolution)
    lons = np.arange(bbox[0] + resolution / 2, bbox[2], resolution)
    region = box(*bbox)
    with zipfile.ZipFile(source) as archive:
        reader = shapefile.Reader(
            shp=io.BytesIO(archive.read('ne_10m_land.shp')),
            shx=io.BytesIO(archive.read('ne_10m_land.shx')),
            dbf=io.BytesIO(archive.read('ne_10m_land.dbf')),
        )
        clipped_land = [shape(polygon.__geo_interface__).intersection(region)
                        for polygon in reader.iterShapes()
                        if box(*polygon.bbox).intersects(region)]
    land = unary_union([geometry for geometry in clipped_land if not geometry.is_empty])
    rows = []
    for lat in lats:
        row = ''
        for lon in lons:
            cell = box(lon - resolution / 2, lat - resolution / 2,
                       lon + resolution / 2, lat + resolution / 2)
            row += '0' if land.intersection(cell).area > 1e-12 else '1'
        rows.append(row)
    result = {
        'source': 'Natural Earth 10m land polygons, version 5.1.1',
        'source_url': SOURCE_URL,
        'source_zip_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'rule': '1 only when the entire 0.05-degree cell has no land-polygon area overlap',
        'bbox_wgs84': bbox,
        'resolution_degrees': resolution,
        'water_rows_south_to_north': rows,
    }
    target = ROOT / 'pipeline/config' / CONFIG['marine_water_mask']
    target.write_text(json.dumps(result, indent=2) + '\n', encoding='utf8')
    print(f'{sum(row.count("1") for row in rows)} water cells of {len(lats) * len(lons)}; {target}')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('Usage: python scripts/generate_marine_water_mask.py PATH_TO_ZIP')
    main(pathlib.Path(sys.argv[1]))
