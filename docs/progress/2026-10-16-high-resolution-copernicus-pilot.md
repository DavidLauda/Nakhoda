# Progress: measured ~1 km Copernicus sea-condition grid

**Date:** 16 October 2026 (Asia/Jakarta)  
**Status:** Implemented and validated locally; not published to Supabase, committed, or pushed.

## Goal

Make the colored sea-condition cells for the Teluk Jakarta and Kepulauan Seribu pilot smaller using real SST and chlorophyll observations. Keep conservation zoning separate from the environmental score. A blank cell remains unclassified; no fine detail is inferred from the previous 0.05° SST grid.

## Live source check

- Copernicus Marine dataset `cmems_obs-oc_glo_bgc-plankton_nrt_l3-olci-300m_P1D` exists. Its subset for the pilot from 12–14 October contains `CHL`, `CHL_uncertainty`, and land `flags`. The subset grid is approximately **0.00556° (~600 m)** despite the dataset's 300 m product label. On 14 October, 14,732 of 17,007 sea-flagged source pixels had finite positive chlorophyll. The 12 October slice had none.
- CDSE catalog search found Sentinel-3 `SL_2_WST___` scenes intersecting the pilot. One non-time-critical nadir file from scene `S3A_SL_2_WST____20261014T025548_20261014T025848_20261015T090840_0179_145_089_3060_MAR_O_NT_004.SEN3` was downloaded and inspected. Acquisition was **14 October 2026, 02:55:48–02:58:48 UTC**. It contains SST skin temperature, `quality_level`, L2P flags, geolocation, and uncertainty. Its stated approximate geospatial spacing is 0.009°.
- On a 0.01° grid covering `[106.35, -6.20, 107.10, -5.35]`, the selected SST scene yielded **4,953** cells with quality level ≥4 and no land, ice, lake, river, or cloud flags. The 14 October chlorophyll slice yielded **4,381** cells with at least two measured pixels and uncertainty ≤60%. **4,277** cells had both inputs; **2,973** had the valid neighboring cells required by the existing temperature-front scoring algorithm. These are counts from actual downloaded pixels, not catalog-footprint counts.
- The paired observation passed a non-publishing run of the new processor. It wrote `pipeline/out/highres-discovery.json` with source IDs, acquisition times, quality flags, and 2,973 cells. The output directory and downloaded NetCDF files are Git-ignored.

## Local changes

- Added `pipeline/analysis/highres.py` to aggregate measured SST and chlorophyll onto 0.01° cells, apply quality and land flags, and leave unobserved cells empty. The score has its own algorithm version, `environment-index-highres-v0.1`.
- Added bounded acquisition in `pipeline/providers/highres.py` and a manually publishable runner in `pipeline/highres_run.py`. It downloads individual Sentinel-3 nadir NetCDF nodes, caps each at 35 MB and each search at eight scenes, caps publication at 5,000 cells, and publishes in 200-row batches only with `--publish`.
- Added the separate `marine-highres` GitHub Actions choice. It requires `CDSE_USERNAME`/`CDSE_PASSWORD` for OData download in addition to the existing Marine and Supabase secrets. The `CDSE_CLIENT_ID`/`CDSE_CLIENT_SECRET` pair remains for Sentinel Hub/Sentinel-2; it is not the OData login. Both new secret names are listed blank in `.env.example`.
- Changed the `environment-cells` API to fetch the complete latest acquisition in 1,000-row pages, up to 6,000 rows, and prefer a completed high-resolution publication younger than seven days. Without one, the existing 0.05° layer remains the source. The map already sizes polygons from each row's `resolution` field. The fisherman view now refreshes every five minutes to avoid repeatedly transferring thousands of daily cells each minute.
- Added focused checks for rejecting cloud/land chlorophyll gaps and low-quality/land-flagged SST pixels.

## Remaining limits and next operational step

- **No shared map has changed yet.** The high-resolution result has not been sent to Supabase. A manually run workflow needs the two additional CDSE GitHub Actions secrets, and repository changes need review before a user commit/push. Local `.env.local` values are separate from GitHub Actions secrets.
- Publication order matters: review and commit/push the API/workflow changes, wait until the updated app is deployed, add the two GitHub Actions secrets, then run `marine-highres` and inspect its `discovery-metadata` artifact. Publishing 2,973 cells while an older app still has a 500-row API limit would display only part of the grid.
- The score compares relative ocean conditions. It is neither a measured fish-catch probability nor permission to fish. The 0.01° cells can still overlap small islands or legal-zone boundaries; the land screen is based on OLCI flags, not a nautical chart. The official KKP map remains necessary for activity rules.
- Cloud cover can leave holes. The selected 14 October pair yielded 2,973 scored cells of 6,375 possible 0.01° cells. A future day may produce fewer cells or fail the minimum-quality gate. The data source is SST **skin** temperature, whereas the older layer uses a Level-4 analyzed SST product, so scores across the two versions are not directly comparable.
- This trial uses one best recent Sentinel-3 scene, not a multi-scene mosaic. The 300 m chlorophyll product's toolbox subset was ~600 m, so the displayed resolution is reported as ~1.1 km, not 300 m.
- The selected 14 October SST scene is daytime in the pilot: all 6,026 quality-screened source pixels within the AOI carry the L2P day flag. The output records `sst_daytime_skin`. A checked 13 October nighttime scene yielded only 302 score-eligible 0.01° cells when paired with 14 October chlorophyll, so it did not replace the better-covered daytime sample. Daytime skin warming remains a limitation of this experimental score.

## Verification

- Local live Copernicus Marine and CDSE token/download requests succeeded. No credentials or tokens were written to tracked files or discovery metadata.
- `python -m pipeline.highres_run --env-file .env.local` completed with `published_to_supabase: false`, 4,277 paired cells, 2,973 eligible cells, and `sst_day_fraction: 1.0` for the selected pair.
- Full Python pipeline tests: 10 passed. Node tests: 5 passed. TypeScript typecheck and production Next.js build passed (four existing lint warnings).
- A read-only Supabase query verified that the new `source_asset_ids` array filter and paging work against the existing pilot cells. The high-resolution publication itself remains untested against Supabase because it has not been authorized or run.
- A local QA image at `pipeline/out/highres-preview-2026-10-14.png` shows measured cells, blank water, land flags, and the separate conservation reference; this ignored image is a preview, not the app map.

## Sources

- [Copernicus Marine OLCI Level-3 ocean-colour product](https://data.marine.copernicus.eu/product/OCEANCOLOUR_GLO_BGC_L3_NRT_009_101/services)
- [EUMETSAT SLSTR SST product format and quality changes](https://user.eumetsat.int/s3/ope-eup-strapi-media/Sentinel_3_Product_Notice_SLSTR_level_2_Sea_Surface_Temperature_PB_004_00_01_8e2321097d.pdf)
- [CDSE OData product download and authentication](https://documentation.dataspace.copernicus.eu/APIs/OData.html)
- [CDSE account registration and email login](https://documentation.dataspace.copernicus.eu/Registration.html)
