# Source selection and live probe record

Checked against official provider documentation on 14 October 2026. IDs below are real catalogue IDs, while actual coverage, scene IDs, numeric units and credentials must still be confirmed by a successful pilot request. The configured pilot bbox `[106.35,-6.20,107.10,-5.35]` is a search envelope, not a shoreline or jurisdiction polygon. The two ~2 km² squares near Pari and Pramuka are candidate study areas; visually confirm them and add a licensed habitat mask before describing any pixel as mapped coral.

| Source | Confirmed ID / endpoint | Use and caveat |
|---|---|---|
| NOAA CRW 5 km v3.1 | `CRW_5km_v3.1_daily`; [STAR daily NetCDF directory](https://www.star.nesdis.noaa.gov/pub/socd/mecb/crw/data/5km/v3.1_op/nc/v1.0/daily/) | Daily `sst`, `hs`, `dhw` and official `baa5-max-7d` directories. File names are discovered per date. Alert is a 7-day maximum, separate from single-day fields. [NOAA product explanation](https://coralreefwatch.noaa.gov/product/5km/). |
| Sentinel-2 L2A | `sentinel-2-l2a`; [Catalog search](https://sh.dataspace.copernicus.eu/catalog/v1/search), [Process](https://sh.dataspace.copernicus.eu/process/v1), [OAuth token](https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token) | CDSE OAuth client required. Small cropped B02/B03/B04/B08/SCL/dataMask TIFFs, exact projected grid. [CDSE examples](https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Process/Examples/S2L2A.html). |
| Copernicus Marine OSTIA SST | Product `SST_GLO_SST_L4_NRT_OBSERVATIONS_010_001`, dataset `METOFFICE-GLO-SST-L4-NRT-OBS-SST-V2`, variable `analysed_sst` | 0.05° daily foundation SST in kelvin, converted to °C after CF decoding. [Product](https://data.marine.copernicus.eu/product/SST_GLO_SST_L4_NRT_OBSERVATIONS_010_001/services), [PUM](https://documentation.marine.copernicus.eu/PUM/CMEMS-SST-PUM-010-001.pdf). |
| Copernicus Marine ocean colour | Product `OCEANCOLOUR_GLO_BGC_L4_NRT_009_102`, dataset `cmems_obs-oc_glo_bgc-plankton_nrt_l4-gapfree-multi-4km_P1D`, variable `CHL` | Gap-filled 4 km daily chlorophyll-a. Preserve units/quality and do not mistake gap filling for direct observations everywhere. [Product](https://data.marine.copernicus.eu/product/OCEANCOLOUR_GLO_BGC_L4_NRT_009_102/services), [PUM](https://documentation.marine.copernicus.eu/PUM/CMEMS-OC-PUM.pdf). |
| Gmail API | [POST `https://gmail.googleapis.com/gmail/v1/users/me/messages/send`](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send) | OAuth `gmail.send`; provider acceptance is not inbox delivery. |

## Actual public-data probe

The local NOAA adapter made actual HTTPS requests, discovered the latest common downloadable four-field date **12 October 2026**, downloaded the four NetCDF files and decoded the provider's time, units, fill values and native grid positions. A newer 13 October SST file was listed but returned HTTP 404, so discovery fell back to the verified common date. The checked source URLs, filenames, source SHA-256 hashes, numeric fields and quality flags are included in [`public/verified-noaa-snapshot.json`](../public/verified-noaa-snapshot.json). This is a **separate, locally processed source-probe record**. No Supabase project exists, so the live authenticated observation table is empty and the record is not ingested/published there.

| Candidate square | NOAA grid center | SST | HotSpot | DHW | Official 7-day alert code |
|---|---:|---:|---:|---:|---:|
| Pari | 106.625°E, 5.875°S | 29.62 °C | 0.23 °C | 0.00 °C-weeks | 1 |
| Pramuka | 106.625°E, 5.725°S | 29.56 °C | 0.19 °C | 0.00 °C-weeks | 1 |

SST/HotSpot/DHW source time is 12 October 2026 12:00 UTC; the 7-day alert interval is 6–12 October 2026. These approximately 5 km pixels are regional heat-stress context. They neither establish coral damage nor cover the small optical squares at reef resolution.

The CDSE, Copernicus Marine, Supabase and Gmail adapters have **not** made successful authenticated requests because the team has no accounts or credentials yet. Product IDs and endpoint paths above come from provider documentation; actual pilot coverage, server response schemas and account quotas still require live probes. The project does not fabricate scene IDs, environmental scores, email receipts, or delivery states.
