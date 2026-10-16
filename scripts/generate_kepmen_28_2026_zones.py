"""Build the South Kepulauan Seribu conservation layer from KKP Decision 28/2026, Lampiran I.

Download https://jdih.kkp.go.id/peraturan/2026kepmenkp028.pdf, extract its text
(for example with macOS PDFKit or `pdftotext -raw`), then run:
python scripts/generate_kepmen_28_2026_zones.py PATH_TO_TEXT
Writes public/conservation-south-kkp-2026.geojson.

Lampiran I lists numbered boundary points, not polygons. Points are joined in
number order, which reproduces the stated hectares for most areas (the decree
counts water only, so rings around islands come out larger). Two inconsistencies
in the source are recorded on the features instead of being guessed away:
Area III's point table does not trace the ellipse drawn in Lampiran II, and the
"Zona Lain" tables repeat point numbers with different coordinates, so those
small zones are left out.
"""
from __future__ import annotations

import json
import math
import pathlib
import re
import sys

SOURCE = 'KKP Decision 28/2026, Lampiran I (https://jdih.kkp.go.id/Homedev/DetailPeraturan/7029)'
NAME = 'Taman Perairan Kepulauan Seribu Selatan'
R = lambda a, b: list(range(a, b + 1))
# (area, island, kind, ring point numbers, hectares stated in diktum KETIGA or None when the decree only gives a combined figure)
RINGS = [
    ('I', 'Pulau Damar Kecil', 'outer', R(1, 4), 13.30),
    ('II', 'Pulau Rambut', 'outer', R(5, 43), 170.52),
    ('II', 'Pulau Rambut', 'Inti', R(44, 53), None),
    ('II', 'Pulau Rambut', 'Inti', R(54, 61), None),
    ('III', 'Pulau Bokor', 'outer', R(64, 95), 206.30),
    ('IV', 'Pulau Pari', 'outer', R(97, 107), None),
    ('IV', 'Pulau Pari', 'Inti', R(108, 113), 4.47),
    ('V', 'Pulau Pari', 'outer', R(114, 117), None),
    ('VI', 'Pulau Payung', 'outer', R(118, 121), None),
    ('VII', 'Pulau Payung', 'outer', [122, 123, 124, 125, 127, 128, 130, 131, 132], None),
    ('VII', 'Pulau Payung', 'Inti', R(126, 129), 3.54),
    ('VIII', 'Pulau Tidung Kecil', 'outer', R(133, 136), None),
    ('IX', 'Pulau Tidung Kecil', 'outer', R(137, 140), None),
    ('IX', 'Pulau Tidung Kecil', 'Inti', R(141, 145), None),
    ('IX', 'Pulau Tidung Kecil', 'Inti', R(146, 155), None),
    ('X', 'Pulau Tidung Besar', 'outer', R(156, 162), 8.90),
    ('X', 'Pulau Tidung Besar', 'Inti', [156, 157, 163, 164, 165, 161, 162], 5.12),
    ('XI', 'Pulau Karang Beras', 'outer', R(166, 169), 38.50),
    ('XI', 'Pulau Karang Beras', 'Inti', R(170, 174), 2.88),
    ('XII', 'Pulau Air', 'outer', R(175, 187), 21.90),
]
NOTES = {'III': 'Tabel titik Lampiran I tidak membentuk elips pada peta Lampiran II; bentuk ini perkiraan.'}
POINT = re.compile(r"(\d+) (?:Bujur Timur \(BT\) )?(\d+)° (\d+)' ([\d,]+)\" (?:Lintang Selatan \(LS\) )?(\d+)° (\d+)' ([\d,]+)\"")


def dms(d: str, m: str, s: str) -> float:
    return int(d) + int(m) / 60 + float(s.replace(',', '.')) / 3600


def read_points(text: str) -> dict[int, tuple[float, float]]:
    body = text[text.index('Area I. Perairan'):text.index('LAMPIRAN II')]
    flat = re.sub(r'\s+', ' ', body)
    points: dict[int, tuple[float, float]] = {}
    # Skip the "Zona Lain" tables: they reuse point numbers with shifted latitudes.
    for table in re.split(r'Titik Koordinat Batas ', flat)[1:]:
        if table.startswith('Zona Lain'):
            continue
        for n, a, b, c, d, e, f in POINT.findall(table):
            points.setdefault(int(n), (round(dms(a, b, c), 7), round(-dms(d, e, f), 7)))
    return points


def hectares(ring: list[tuple[float, float]]) -> float:
    lat0 = sum(p[1] for p in ring) / len(ring)
    xy = [(lon * 111320 * math.cos(math.radians(lat0)), lat * 110574) for lon, lat in ring]
    return abs(sum(xy[i][0] * xy[i - 1][1] - xy[i - 1][0] * xy[i][1] for i in range(len(xy)))) / 2 / 1e4


def main(text_path: str) -> None:
    points = read_points(pathlib.Path(text_path).read_text())
    features = []
    for area, island, kind, ids, stated in RINGS:
        ring = [points[i] for i in ids]
        zone = 'Inti' if kind == 'Inti' else 'Pemanfaatan Terbatas'
        props = {'id': f'kkp28-{area}-{len(features)}', 'kind': 'conservation', 'zoneType': zone,
                 'name': f'{NAME} · Area {area} ({island})', 'source': SOURCE,
                 'computedHa': round(hectares(ring), 2), 'statedHa': stated}
        if area in NOTES:
            props['note'] = NOTES[area]
        features.append({'type': 'Feature', 'geometry': {'type': 'Polygon', 'coordinates': [ring + [ring[0]]]}, 'properties': props})
    # Draw the area boundaries first so core zones sit on top of them.
    features.sort(key=lambda f: f['properties']['zoneType'] == 'Inti')
    out = pathlib.Path(__file__).resolve().parents[1] / 'public' / 'conservation-south-kkp-2026.geojson'
    out.write_text(json.dumps({'type': 'FeatureCollection', 'features': features}, separators=(',', ':')) + '\n')
    for f in features:
        p = f['properties']
        print(f"{p['name']:60s} {p['zoneType']:22s} {p['computedHa']:8.2f} ha  stated {p['statedHa']}")
    print(f'wrote {len(features)} features to {out}')


if __name__ == '__main__':
    main(sys.argv[1])
