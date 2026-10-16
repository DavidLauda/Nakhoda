"""Create the 0.01-degree display grid, clipping every cell against GSHHG land.

Usage: .venv/Scripts/python scripts/generate_sea_grid.py path/to/gshhg-shp-2.3.7.zip
Install generation dependencies: pip install "pyshp>=2.3,<4" "shapely>=2,<3".
Download gshhg-shp-2.3.7.zip from SOURCE below. No network requests are made here.
"""
from __future__ import annotations

import hashlib
import io
import json
from pathlib import Path
import sys
import zipfile

import shapefile
from shapely import make_valid
from shapely.geometry import box, mapping, shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
SOURCE = 'https://github.com/GenericMappingTools/gshhg-gmt/releases/tag/2.3.7'
SHA256 = '8dbbe7e071e77e9e75f2d639239099ebca8d5c16d6a07df8169729d49f15cf41'


def main(path: Path):
    if hashlib.sha256(path.read_bytes()).hexdigest() != SHA256:
        raise ValueError('GSHHG archive checksum does not match the official 2.3.7 release')
    bbox = json.loads((ROOT / 'pipeline/config/pilot.json').read_text())['search_bbox_wgs84']
    west, south, east, north = bbox
    region = box(*bbox)
    with zipfile.ZipFile(path) as archive:
        base = next(n[:-4] for n in archive.namelist() if n.endswith('GSHHS_f_L1.shp'))
        reader = shapefile.Reader(**{ext: io.BytesIO(archive.read(f'{base}.{ext}')) for ext in ('shp','shx','dbf')})
        polygons = [make_valid(shape(s.__geo_interface__)).intersection(region) for s in reader.iterShapes(bbox=bbox)]
        polygons = [p for p in polygons if not p.is_empty]
        notices = ['LICENSE.TXT','COPYING.LESSERv3','COPYINGv3']
        license_text = '\n\n'.join(archive.read(n).decode('utf8') for n in notices if n in archive.namelist())
        (ROOT / 'public/gshhg-license.txt').write_text(license_text,encoding='utf8')
    land = unary_union(polygons)
    step = .01
    cells = []
    clipped_count = 0
    sea_area = 0.0
    for y in range(round((north-south)/step)):
        for x in range(round((east-west)/step)):
            cell = box(west+x*step, south+y*step, west+(x+1)*step, south+(y+1)*step)
            sea = cell.difference(land)
            if sea.is_empty or sea.area <= 1e-12:
                continue
            if sea.geom_type == 'GeometryCollection':
                sea = unary_union([p for p in sea.geoms if p.geom_type in ('Polygon','MultiPolygon')])
            assert sea.geom_type in ('Polygon','MultiPolygon')
            assert sea.intersection(land).area < 1e-12
            sea_area += sea.area
            if cell.intersection(land).area > 1e-12:
                cells.append([x,y,mapping(sea)])
                clipped_count += 1
            else:
                cells.append([x,y])
    assert abs(sea_area-region.difference(land).area) < 1e-8, 'Sea coverage has gaps'
    metadata = {'source':'GSHHG 2.3.7 (full resolution, L1)', 'source_url':SOURCE,
                'source_zip_sha256':SHA256, 'license':'LGPL-3.0-or-later', 'bbox_wgs84':bbox,
                'land_polygon_count':len(polygons)}
    (ROOT / 'public/sea-grid.json').write_text(json.dumps({**metadata,'origin':[west,south],
        'step':step,'cells':cells},separators=(',',':'))+'\n',encoding='utf8')
    (ROOT / 'public/pilot-land-gshhg.geojson').write_text(json.dumps({'type':'FeatureCollection',
        'features':[{'type':'Feature','properties':metadata,'geometry':mapping(land)}]},separators=(',',':'))+'\n',encoding='utf8')
    print(json.dumps({'sea_cells':len(cells),'coastal_cells':clipped_count,'land_polygons':len(polygons),'sea_coverage_verified':True}))


if __name__ == '__main__':
    main(Path(sys.argv[1]))
