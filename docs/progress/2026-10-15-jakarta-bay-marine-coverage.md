# Progress: Restore Jakarta Bay and Kepulauan Seribu sea-condition coverage

**Date:** 15 October 2026 (Asia/Jakarta)

## Why this changed

The 0.05° Marine grid originally used a bounding box that reached Jakarta Bay. Its first full-grid publication colored some cells on the Jakarta mainland because the source sampling was not a reliable coastline test. Narrowing the box to `[106.40, -5.95, 106.90, -5.35]` removed those cells but also removed Jakarta Bay from the pilot map. This was an overcorrection.

## Changes

- Restored the bounded Marine envelope `[106.35, -6.20, 107.10, -5.35]`, which includes Jakarta Bay and Kepulauan Seribu. The Marine AOI is now `pilot-aoi-v0.3` and its published index is `environment-index-v0.4`; NOAA and Sentinel study-area keys remain unchanged.
- Generated a 255-cell water mask from [Natural Earth 10m land polygons, version 5.1.1](https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-land/). A cell is accepted only if its entire 0.05° polygon has no mapped-land overlap. The mask has **195 water cells** and rejects all 15 cells in the southern mainland row. Its JSON records the source URL, archive SHA-256, envelope, resolution, and exact rule. The runtime fails if the configured grid no longer matches the mask.
- Applied the mask before computing the SST spatial gradient so land-adjacent cells cannot provide gradient neighbors. Included a `natural_earth_land_mask_v0.1` quality flag on published cells.
- Revised the initial map view and labels to show both locations. The green Marine layer still means relative sea conditions, not an official fishing zone or a prediction of catch. The separate BIG conservation polygons remain a northern Kepulauan Seribu reference only.
- Added a reproducible local mask generator. It needs `pyshp` and `shapely` only when regenerating the committed mask; the daily workflow reads JSON and gains no new dependency.
- Made local Marine subset filenames AOI-specific so a previous narrow subset cannot be reused after changing the envelope.

## Verification

- Five focused Python tests passed, including Jakarta Bay water, mainland exclusion, and mismatch failure.
- TypeScript typecheck and both Node tests passed.
- `npm run lint` completed with zero errors (four existing warnings), and `npm run build` passed.
- [Live Marine workflow run #5](https://github.com/DavidLauda/Nakhoda/actions/runs/38751717552) succeeded and published **145 distinct sea-condition cells** to Supabase. Its `discovery-metadata` artifact reported `state: available`, center coordinates spanning **106.425–107.025° E** and **-6.025–-5.425° N**, and all published cells carrying the coastline-mask quality flag. Cells near -6.025° N confirm the Jakarta Bay extension. SST acquisition was **14 October 2026 00:00 UTC**; chlorophyll-a acquisition was **13 October 2026 00:00 UTC**. The provider warned that the requested end time exceeded its newest available timestamp, with no fetch error.
- Opened the fisherman quick-login flow and visually confirmed the rendered grid extends into Jakarta Bay while the conservation polygons remain farther north. [Map screenshot](assets/2026-10-15-jakarta-bay-map.png).

## Limitations

- Natural Earth 1:10m is a generalized coastline. Tiny islands, reclamation changes, and sub-cell coastline details may not be resolved. A 0.05° cell is about 5.5 km; the map is not for navigation.
- The available BIG conservation polygons cover only six northern Taman Nasional Kepulauan Seribu features. Their legal currency and permitted activities are not verified in the app. Blank or green Jakarta Bay water does **not** establish permission to fish.
- The environmental index is an exploratory ranking of SST gradients and chlorophyll-a; its correlation with fishing outcomes has not been validated.
