# Progress: optical change ignores cloud edges (`optical-change-v0.2`)

**Date:** 16 October 2026 (Asia/Jakarta)
**Status:** Implemented and tested locally (`python -m pytest -q pipeline/tests`: 15 passed). Not re-run against CDSE, not published to Supabase, not committed.

## Problem

Observation `c0666d4b` (Pulau Pramuka study square, `S2C_MSIL2A_20260915T025521` → `S2C_MSIL2A_20261015T025701`, tile T48MXU) published 1,150 candidate pixels in 33 polygons. They sit under a thin cloud over the NE of the island (~106.618–106.620 E, −5.740 to −5.7415). The SCL mask missed the thin cloud and its edges.

## Change

- `pipeline/analysis/optical.py`: SCL classes 3/8/9/10 in both scenes are dilated by a disk of `cloud_buffer_px` pixels before differencing. The function computes the fraction of the study square that SCL classifies as cloud in each scene. A pair over `max_square_cloud_fraction` is flagged `cloud_in_study_area`, gets state `insufficient_clear_imagery`, and publishes no candidates. Version bumped to `optical-change-v0.2`.
- `pipeline/config/pilot.json` (`sentinel`): `cloud_buffer_px: 5` (50 m) and `max_square_cloud_fraction: 0.05`. Changing them changes `parameters_hash`.
- `pipeline/providers/sentinel.py`: passes both settings through and adds `square_cloud_fraction_before`, `square_cloud_fraction_after` and `cloud_buffer_m` to the observation's `metrics`.
- `pipeline/tests/test_optical.py`: tests for removing candidates in a haze ring next to an SCL cloud, keeping candidates in a clear pair, and suppressing candidates when the study square is cloudy.
- `docs/ALGORITHMS.md`: optical-change section updated.

## Open points

- It is unverified whether v0.2 removes all 33 polygons of `c0666d4b`. If SCL flagged none of that thin cloud, the buffer has nothing to grow from. A rerun on the same scene pair should check the new square cloud fractions and candidate count before anything is republished. If the fraction is still zero, a reflectance-based haze test (e.g. a B02 brightness threshold) is the next step.
- The existing `c0666d4b` row in Supabase is unchanged. The dashboard's ≥15% scene-cloud stopgap in `lib/review.ts` still applies.
- Thresholds (5 px, 5%) are judgment calls, not calibrated against labeled scenes.
