"""Experimental measured ~1 km sea-condition grid; publication is opt-in."""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
from pathlib import Path

import numpy as np
import xarray as xr

from pipeline.analysis.highres import VERSION, chlorophyll_grid, paired_index, sst_grid
from pipeline.providers import highres
from pipeline.publish import Publisher, stable_key


ROOT = Path(__file__).resolve().parent
CONFIG = json.loads((ROOT / 'config/pilot.json').read_text(encoding='utf8'))
OUT = ROOT / 'out'
MAX_PUBLISHED_CELLS = 5000
MIN_ELIGIBLE_CELLS = 100
TARGET_ELIGIBLE_CELLS = 1000


def _utc(value: str) -> str:
    if not value:
        raise ValueError('Source acquisition timestamp is missing')
    return value if value.endswith('Z') else value + 'Z'


def _candidate(chl_path: Path, chl_index: int, sst_path: Path) -> dict:
    bbox = CONFIG['search_bbox_wgs84']
    with xr.open_dataset(chl_path, mask_and_scale=True) as ds:
        chl = chlorophyll_grid(ds, chl_index, bbox)
    with xr.open_dataset(sst_path, mask_and_scale=True) as ds:
        sst = sst_grid(ds, bbox)
    result = paired_index(chl, sst, bbox)
    result['chl_time'] = chl['time']
    result['sst_start'] = _utc(sst['start'])
    result['sst_end'] = _utc(sst['end'])
    result['sst_day_fraction'] = sst['day_fraction']
    return result


def _discover(chl_path: Path, sst_file: Path | None, scene_name: str | None) -> tuple[dict, str]:
    with xr.open_dataset(chl_path, mask_and_scale=True) as ds:
        dated = [(i, dt.date.fromisoformat(str(value)[:10])) for i, value in enumerate(ds.time.values)
                 if np.isfinite(chlorophyll_grid(ds, i, CONFIG['search_bbox_wgs84'])['values']).sum() >= MIN_ELIGIBLE_CELLS]
    if sst_file is not None:
        if not scene_name:
            raise ValueError('--scene-name is required with --sst-file')
        index = next((i for i, day in reversed(dated) if day.strftime('%Y%m%d') in scene_name), None)
        if index is None:
            raise ValueError('SST scene date is absent from chlorophyll sample')
        return _candidate(chl_path, index, sst_file), scene_name

    token = highres.access_token()
    downloaded = 0
    best: tuple[dict, str] | None = None
    for index, day in reversed(dated[-4:]):
        scenes = highres.catalog_scenes(CONFIG['search_bbox_wgs84'], day)
        for scene in scenes:
            if downloaded >= 8:
                break
            path = highres.download_nadir(scene, token, OUT / 'highres-cache')
            downloaded += 1
            candidate = _candidate(chl_path, index, path)
            if best is None or candidate['eligible_cells'] > best[0]['eligible_cells']:
                best = candidate, scene['Name']
        if best and best[0]['eligible_cells'] >= TARGET_ELIGIBLE_CELLS:
            break
        if downloaded >= 8:
            break
    if best is None:
        raise RuntimeError('No matching Sentinel-3 SST scene found for recent chlorophyll dates')
    return best


def _cells(result: dict, scene_name: str, area_id: str | None) -> list[dict]:
    if result['state'] != 'available' or result['eligible_cells'] < MIN_ELIGIBLE_CELLS:
        raise RuntimeError(f"Insufficient high-resolution coverage: {result['state']}, {result['eligible_cells']} eligible")
    if result['eligible_cells'] > MAX_PUBLISHED_CELLS:
        raise RuntimeError(f'High-resolution grid exceeds {MAX_PUBLISHED_CELLS} cell publication cap')
    source_ids = [f"{highres.CHL_DATASET}@{result['chl_time']}", scene_name]
    half = result['resolution_degrees'] / 2
    observed_start = min(result['chl_time'], result['sst_start'])
    observed_end = max(result['chl_time'], result['sst_end'])
    flags = ['zoning_unverified', 'experimental_highres',
             'sst_slstr_l2p_quality_ge_4', 'chlorophyll_olci_l3_observed',
             'chlorophyll_uncertainty_le_60_percent', 'olci_land_flag_mask']
    if result['sst_day_fraction'] is not None and result['sst_day_fraction'] >= 0.5:
        flags.append('sst_daytime_skin')
    rows = []
    for y, x in np.argwhere(np.isfinite(result['index'])):
        lon = float(result['longitudes'][x]); lat = float(result['latitudes'][y])
        rows.append({
            'result_key': stable_key(source_ids, VERSION, int(y), int(x)),
            'area_id': area_id,
            'geom': f'SRID=4326;POLYGON(({lon-half} {lat-half},{lon+half} {lat-half},{lon+half} {lat+half},{lon-half} {lat+half},{lon-half} {lat-half}))',
            'lon': lon, 'lat': lat,
            'observed_start': observed_start, 'observed_end': observed_end,
            'source_asset_ids': source_ids,
            'sst_c': float(result['sst_c'][y, x]),
            'chlorophyll_mg_m3': float(result['chl_mg_m3'][y, x]),
            'front_rank': float(result['front_rank'][y, x]),
            'chlorophyll_component': float(result['chlorophyll_component'][y, x]),
            'index_score': int(result['index'][y, x]),
            'algorithm_version': VERSION,
            'resolution': '0.01 degree (~1.1 km)',
            'quality_flags': flags + (['sst_gradient_one_sided'] if result['one_sided'][y, x] else []),
            'exclusion': None, 'zoning_verified': False,
        })
    return rows


def _publish(rows: list[dict], result: dict, scene_name: str) -> None:
    pub = Publisher()
    area_id = pub.pilot_area()
    pub.upsert('source_assets', {
        'source_name': 'Copernicus Marine', 'product_id': highres.CHL_PRODUCT,
        'asset_id': f"{highres.CHL_DATASET}@{result['chl_time']}",
        'source_url': 'https://data.marine.copernicus.eu/product/OCEANCOLOUR_GLO_BGC_L3_NRT_009_101/services',
        'observed_start': result['chl_time'], 'observed_end': result['chl_time'],
        'native_resolution': 'OLCI 300 m nominal; subset grid 0.00556 degree',
        'quality_flags': ['chlorophyll_uncertainty_le_60_percent', 'olci_land_flag_mask'],
    }, 'source_name,product_id,asset_id')
    pub.upsert('source_assets', {
        'source_name': 'CDSE Sentinel-3', 'product_id': highres.SST_PRODUCT,
        'asset_id': scene_name, 'source_url': 'https://browser.dataspace.copernicus.eu/',
        'observed_start': result['sst_start'], 'observed_end': result['sst_end'],
        'native_resolution': 'SLSTR L2P SST skin, approximately 1 km',
        'quality_flags': ['sst_slstr_l2p_quality_ge_4'] + (['sst_daytime_skin'] if result['sst_day_fraction'] is not None and result['sst_day_fraction'] >= 0.5 else []),
    }, 'source_name,product_id,asset_id')
    for row in rows:
        row['area_id'] = area_id
    for offset in range(0, len(rows), 200):
        pub.upsert('environment_cells', rows[offset:offset + 200], 'result_key')
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    source_ids = rows[0]['source_asset_ids']
    pub.upsert('analysis_runs', {
        'run_key': stable_key('marine-highres', VERSION, result['chl_time'], scene_name),
        'source_name': 'Copernicus Marine + CDSE Sentinel-3',
        'job_url': os.getenv('GITHUB_RUN_URL'), 'status': 'success',
        'started_at': now, 'ended_at': now, 'latest_check_at': now,
        'latest_available_observation_at': max(result['chl_time'], result['sst_end']),
        'latest_usable_observation_at': max(result['chl_time'], result['sst_end']),
        'latest_published_result_at': now, 'error_code': None,
        'counts': {'cells': len(rows), 'source_asset_ids': source_ids,
                   'algorithm_version': VERSION, 'observed_end': rows[0]['observed_end']},
    }, 'run_key')


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--publish', action='store_true', help='Write verified cells to Supabase')
    parser.add_argument('--env-file', type=Path, help='Local ignored env file; values are never printed')
    parser.add_argument('--chl-file', type=Path, help='Local sample for repeatable dry run')
    parser.add_argument('--sst-file', type=Path, help='Local sample for repeatable dry run')
    parser.add_argument('--scene-name', help='Catalog scene name for a local SST sample')
    args = parser.parse_args()
    if args.env_file:
        for line in args.env_file.read_text(encoding='utf8').splitlines():
            key, sep, value = line.partition('=')
            if sep and key.strip() and not key.lstrip().startswith('#'):
                value = value.strip()
                if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
                    value = value[1:-1]
                os.environ.setdefault(key.strip(), value)
    if bool(args.chl_file) != bool(args.sst_file):
        parser.error('--chl-file and --sst-file must be supplied together')
    if args.publish and args.sst_file:
        parser.error('Publication requires fresh provider discovery, not a local sample')
    OUT.mkdir(exist_ok=True)
    chl_path = args.chl_file or highres.subset_chlorophyll(CONFIG['search_bbox_wgs84'], OUT / 'highres-cache')
    result, scene_name = _discover(chl_path, args.sst_file, args.scene_name)
    rows = _cells(result, scene_name, None)
    report = {
        'state': result['state'], 'published_to_supabase': False,
        'algorithm_version': VERSION, 'bbox_wgs84': CONFIG['search_bbox_wgs84'],
        'grid_degrees': result['resolution_degrees'],
        'chl_dataset_id': highres.CHL_DATASET, 'chl_time': result['chl_time'],
        'sst_product_id': highres.SST_PRODUCT, 'sst_scene': scene_name,
        'sst_start': result['sst_start'], 'sst_end': result['sst_end'],
        'sst_day_fraction': result['sst_day_fraction'],
        'paired_cells': result['paired_cells'], 'eligible_cells': result['eligible_cells'],
        'one_sided_cells': int(np.count_nonzero(result['one_sided'] & np.isfinite(result['index']))),
        'quality_flags': rows[0]['quality_flags'] if rows else [],
        'cells': [{k: v for k, v in row.items() if k != 'area_id'} for row in rows],
    }
    (OUT / 'highres-discovery.json').write_text(json.dumps(report, indent=2), encoding='utf8')
    if args.publish:
        _publish(rows, result, scene_name)
        report['published_to_supabase'] = True
        (OUT / 'highres-discovery.json').write_text(json.dumps(report, indent=2), encoding='utf8')
    print(json.dumps({k: v for k, v in report.items() if k != 'cells'}, indent=2))


if __name__ == '__main__':
    main()
