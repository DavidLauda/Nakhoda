# Progress: Copernicus grid and conservation zoning for Kepulauan Seribu

**Date:** 15 October 2026 (Asia/Jakarta)

## Scope

Keep the pilot in Kepulauan Seribu and show a continuous, data-based division of measured sea conditions alongside the conservation-zone reference layer. The existing Marine adapter uses SST and chlorophyll-a; CDSE Sentinel-2 screens optical changes in two small reef study areas.

## Changes

- Publish every finite 0.05° Marine index cell in the bounded pilot grid, with a 300-cell safety limit, instead of selecting only five separated cells. The index formula is unchanged; its version is `environment-index-v0.2` so the existing daily run can publish the expanded grid once.
- Serve only the newest acquisition pair and algorithm version to the app. Older cells remain in the database for provenance but cannot mix visually with the current grid. Scores older than seven days are hidden.
- Show the grid as clickable map polygons. Dark green identifies the highest 40% of measured cells by relative SST/chlorophyll index; pale green identifies other measured cells. The six BIG conservation polygons remain above the grid, with their source zone types shown separately.
- Keep the government dashboard's measured-cell count in sync with the same current grid.

## Interpretation and limits

- Green is a relative **sea-condition indicator**, not validated fishing suitability, a catch forecast, a safe-navigation route, or permission to fish. The highest 40% threshold is a display convention within the current pilot grid.
- The BIG polygons are a northern national-park zoning reference. The South Kepulauan Seribu area designated by KKP Decision 28/2026 is not covered by those six polygons. Blank water is unclassified in this app; the official KKP map and current activity rules must be checked independently.
- CDSE Sentinel-2 currently covers only the Pari and Pramuka candidate study squares. Its optical-change output has cloud and quality screening but no validated habitat or fishing-suitability model. It cannot responsibly create conservation boundaries or determine the green fishing layer from those two squares.
- The Marine grid covers the configured pilot envelope and nearby water. A 0.05° cell can overlap land or a smaller legal zone; map colors do not resolve sub-cell boundaries.

## Verification

- TypeScript typecheck and both Node tests passed; ESLint passed with four pre-existing warnings.
- The three focused Python environment-index tests passed. Production Next.js build passed with the same four warnings.
- GitHub Marine run and live map check: pending at the time of this entry; update with actual results after completion.

## Sources

- [Copernicus Marine SST product](https://data.marine.copernicus.eu/product/SST_GLO_SST_L4_NRT_OBSERVATIONS_010_001/services)
- [Copernicus Marine ocean-colour product](https://data.marine.copernicus.eu/product/OCEANCOLOUR_GLO_BGC_L4_NRT_009_102/services)
- [CDSE Sentinel-2 L2A processing documentation](https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Process/Examples/S2L2A.html)
- [BIG conservation-zoning service](https://kspservices.big.go.id/satupeta/rest/services/PUBLIK/SUMBER_DAYA_ALAM_DAN_LINGKUNGAN/MapServer/33)
- [KKP Decision 28/2026](https://jdih.kkp.go.id/Homedev/DetailPeraturan/7029)
