# Supabase setup and live satellite pilot probes

**Date:** 2026-10-15 (Asia/Jakarta)

## Progress

- Fixed Core checks to run Python tests with `python -m pytest -q pipeline/tests`. [Run 38716978045](https://github.com/DavidLauda/Nakhoda/actions/runs/38716978045) passed with 6 Python tests.
- Fixed the initial SQL migration's PostGIS call to `extensions.ST_Contains(...)`. The full corrected migration ran successfully in the Nakhoda Supabase SQL Editor. Verified `analysis_runs` and `study_areas` exist and both expected storage buckets were created. The fix is in commit `1ae885f`.
- Retried the separate Marine workflow. [Run 38713789172, attempt 2](https://github.com/DavidLauda/Nakhoda/actions/runs/38713789172) fetched SST dataset `METOFFICE-GLO-SST-L4-NRT-OBS-SST-V2` at `2026-10-14T00:00:00Z` and chlorophyll dataset `cmems_obs-oc_glo_bgc-plankton_nrt_l4-gapfree-multi-4km_P1D` at `2026-10-13T00:00:00Z`. Its `discovery-metadata` artifact reports five cells with `zoning_unverified` and `chlorophyll_gapfilled_l4` flags. Supabase contains five `environment_cells` and one successful Marine `analysis_runs` record.
- Ran Sentinel separately. [Run 38718803777](https://github.com/DavidLauda/Nakhoda/actions/runs/38718803777) fetched a Sentinel-2 L2A pair from 2026-09-15 and 2026-10-15. Its `discovery-metadata` artifact marks **Pramuka published** and **Pari insufficient_clear_imagery** due to low valid overlap. The database contains one successful and one quality-limited Sentinel run, two observation rows, and six image artifacts. Observed scene times are `2026-09-15T03:19:42.263Z` and `2026-10-15T03:19:44.611Z`; valid overlap is about 77.6% for Pramuka and 49.8% for Pari.

## Current limitations and next steps

- The Sentinel results retain `habitat_mask_unavailable` and `tide_depth_turbidity_unresolved` flags. They show optical change in study areas, not a verified coral damage diagnosis.
- Recheck Pari when another comparable clear Sentinel scene is available. The green Actions run means the pipeline executed; it does not make Pari's imagery usable.
- The migration was applied through SQL Editor. `supabase_migrations.schema_migrations` is absent, so a future Supabase CLI migration workflow must reconcile migration history before attempting to apply the initial file again.
