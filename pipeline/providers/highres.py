"""Bounded acquisition of measured OLCI chlorophyll and SLSTR SST samples."""
from __future__ import annotations

import datetime as dt
import os
from pathlib import Path

import copernicusmarine
import requests


CHL_DATASET = 'cmems_obs-oc_glo_bgc-plankton_nrt_l3-olci-300m_P1D'
CHL_PRODUCT = 'OCEANCOLOUR_GLO_BGC_L3_NRT_009_101'
SST_PRODUCT = 'SL_2_WST___'
TOKEN_URL = 'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token'
CATALOG_URL = 'https://catalogue.dataspace.copernicus.eu/odata/v1/Products'
DOWNLOAD_URL = 'https://download.dataspace.copernicus.eu/odata/v1/Products'
MAX_SCENES_PER_DAY = 4
MAX_FILE_BYTES = 35_000_000


def _required(name: str) -> str:
    value = os.getenv(name, '').strip()
    if not value:
        raise RuntimeError(f'{name} is required for the high-resolution source')
    return value


def subset_chlorophyll(bbox: list[float], output: Path) -> Path:
    output.mkdir(parents=True, exist_ok=True)
    end = dt.datetime.now(dt.timezone.utc).date()
    start = end - dt.timedelta(days=5)
    target = output / f'chl-olci-{start}-to-{end}.nc'
    if not target.exists():
        copernicusmarine.subset(
            dataset_id=CHL_DATASET,
            username=_required('COPERNICUSMARINE_SERVICE_USERNAME'),
            password=_required('COPERNICUSMARINE_SERVICE_PASSWORD'),
            variables=['CHL', 'CHL_uncertainty', 'flags'],
            minimum_longitude=bbox[0], maximum_longitude=bbox[2],
            minimum_latitude=bbox[1], maximum_latitude=bbox[3],
            start_datetime=str(start), end_datetime=str(end),
            output_directory=output, output_filename=target.name,
            overwrite=True, disable_progress_bar=True,
        )
    return target


def catalog_scenes(bbox: list[float], day: dt.date) -> list[dict]:
    west, south, east, north = bbox
    polygon = f'POLYGON(({west} {south},{east} {south},{east} {north},{west} {north},{west} {south}))'
    next_day = day + dt.timedelta(days=1)
    filter_ = (
        "Collection/Name eq 'SENTINEL-3' and "
        f"OData.CSC.Intersects(area=geography'SRID=4326;{polygon}') and "
        f'ContentDate/Start ge {day}T00:00:00.000Z and '
        f'ContentDate/Start lt {next_day}T00:00:00.000Z and '
        "Attributes/OData.CSC.StringAttribute/any(att:att/Name eq 'productType' "
        f"and att/OData.CSC.StringAttribute/Value eq '{SST_PRODUCT}')"
    )
    response = requests.get(CATALOG_URL, params={
        '$filter': filter_, '$select': 'Id,Name,ContentDate',
        '$orderby': 'ContentDate/Start desc', '$top': '50',
    }, timeout=60)
    response.raise_for_status()
    data = response.json()
    if data.get('@odata.nextLink'):
        raise RuntimeError('Sentinel-3 catalog exceeded the bounded 50-scene query')
    scenes = data.get('value', [])
    nt = [scene for scene in scenes if '_O_NT_' in scene['Name']]
    nr = [scene for scene in scenes if '_O_NR_' in scene['Name']]
    return (nt or nr)[:MAX_SCENES_PER_DAY]


def access_token() -> str:
    response = requests.post(TOKEN_URL, data={
        'client_id': 'cdse-public', 'grant_type': 'password',
        'username': _required('CDSE_USERNAME'), 'password': _required('CDSE_PASSWORD'),
    }, timeout=30)
    if response.status_code != 200:
        raise RuntimeError(f'CDSE OData authentication failed: HTTP {response.status_code}')
    return response.json()['access_token']


def download_nadir(scene: dict, token: str, output: Path) -> Path:
    """Download one NetCDF node, never the whole product; cap transfer at 35 MB."""
    output.mkdir(parents=True, exist_ok=True)
    root = f"{DOWNLOAD_URL}({scene['Id']})/Nodes({scene['Name']})"
    response = requests.get(root + '/Nodes', timeout=30)
    response.raise_for_status()
    nodes = response.json().get('result', [])
    node = next((x for x in nodes if x.get('Name', '').endswith('.nc') and '_NADIR_' in x['Name']), None)
    if node is None:
        raise RuntimeError('No NADIR SST NetCDF node found in Sentinel-3 scene')
    if node['ContentLength'] > MAX_FILE_BYTES:
        raise RuntimeError('Sentinel-3 SST node exceeds 35 MB safety cap')
    target = output / node['Name']
    if target.exists() and target.stat().st_size == node['ContentLength']:
        return target
    temp = target.with_suffix('.part')
    try:
        with requests.get(root + f"/Nodes({node['Name']})/$value",
                          headers={'Authorization': f'Bearer {token}'},
                          stream=True, timeout=120) as download:
            download.raise_for_status()
            count = 0
            with temp.open('wb') as file:
                for chunk in download.iter_content(chunk_size=1024 * 1024):
                    count += len(chunk)
                    if count > MAX_FILE_BYTES:
                        raise RuntimeError('Sentinel-3 transfer exceeded 35 MB safety cap')
                    file.write(chunk)
        if count != node['ContentLength']:
            raise RuntimeError('Sentinel-3 transfer length does not match catalog node')
        temp.replace(target)
    finally:
        temp.unlink(missing_ok=True)
    return target
