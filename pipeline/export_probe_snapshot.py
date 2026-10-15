"""Export a read-only, clearly separate public record of a locally verified NOAA run."""
from __future__ import annotations
import datetime as dt
import hashlib
import json
import pathlib

root=pathlib.Path(__file__).resolve().parent.parent
record=json.loads((root/'pipeline/out/noaa-discovery.json').read_text(encoding='utf8'))
if not record['areas'] or any(a['state']!='published' for a in record['areas']):raise SystemExit('NOAA extraction did not pass quality checks for every study square')
checksums={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (root/'pipeline/out/noaa-cache').glob('*.nc') if p.name in record['areas'][0]['source_asset_ids']}
if len(checksums)!=4:raise SystemExit('Four NOAA source files are required for this export')
snapshot={'kind':'verified_local_source_probe','notice':'Genuine NOAA data processed locally; not a live or Supabase-published observation. It never appears in authenticated live map layers.','database_published':False,'acquisition_date':record['date'],'processed_at':dt.datetime.now(dt.timezone.utc).isoformat(),'source_name':'NOAA Coral Reef Watch','source_product_id':'CRW_5km_v3.1_daily','algorithm_version':'crw-heat-v0.1','source_urls':record['assets'],'source_sha256':checksums,'areas':[{**area,'state':'usable_local_only'} for area in record['areas']]}
destination=root/'public/verified-noaa-snapshot.json'
destination.write_text(json.dumps(snapshot,indent=2,ensure_ascii=False),encoding='utf8')
print(destination)
