# Progress: Colored conservation and sea-condition areas

**Date:** 15 October 2026 (Asia/Jakarta)

## Request

Show fishers visibly separated conservation areas and relatively better sea conditions on the map. Investigate official conservation geometry, and determine whether our existing data can support manually drawn boundaries.

## Completed

- Retrieved six polygon features intersecting the pilot envelope from Badan Informasi Geospasial's public **Peta Zonasi Kawasan Konservasi** layer 33. All six are labeled TN Kepulauan Seribu: two `Inti`, two `Pemanfaatan`, and two `Perlindungan Bahari`. The imported GeoJSON preserves those shapes and source feature IDs, with coordinates reduced to 2D and rounded to six decimals.
- Added red, amber, and purple map fills for those three source zone labels. Tapping a polygon shows its name and a link to KKP's conservation map.
- Replaced the visual emphasis on point markers with 0.05° colored sea cells built from the same grid size stored by the Marine pipeline. Dark green marks the top 40% of the currently measured cells by *relative* environmental index; pale green marks other measured cells. The points remain selectable for detailed SST, chlorophyll, acquisition time, and quality flags. Blank water is unclassified.
- Updated the government next-step card, the fisher safety copy, the map legend, README, and the judging walkthrough.

## Data limits and next step

- The BIG layer's feature notes mention a July 2021 administrative boundary, but the layer gives no clear current revision date. These polygons are a **reference visualization**, not a certification of the currently operative fishing rules. `Pemanfaatan` is a zone label, not blanket permission to fish.
- KKP Decision 28/2026 establishes a South Kepulauan Seribu conservation area. The six downloaded BIG polygons are for the northern national park and do not cover the south. Obtain the current GIS polygons and activity rules from KKP/SIDAKO or the managing authority, reconcile them with the decision and national-park zoning, and verify on the ground before offering legal avoidance guidance.
- Existing SST/chlorophyll cells cannot establish conservation boundaries. A team can draw candidate GeoJSON polygons in a GIS editor or in a future map editor, but each candidate must be labeled **indicative**, stored with a source and review date, and kept separate from the official reference layer until an authorized source validates it. The two study squares in `pipeline/config/pilot.json` are not conservation polygons.
- The green class is a relative ranking among five current cells, not a validated fishing optimum or catch forecast. Any future fishing recommendation needs biological/landing data, temporal validation, current weather and safety, and verified zoning.

## Verification

- `npm run typecheck` passed.
- `npm run lint` passed with four existing warnings in legacy views.
- `npm run build` passed with the same four existing warnings.
- Local preview at `http://127.0.0.1:3001/map` showed six colored conservation polygons and five green sea cells. Clicking a `Pemanfaatan` polygon showed its source label; clicking a green cell selected its corresponding data card.

## Sources

- BIG zoning layer: https://kspservices.big.go.id/satupeta/rest/services/PUBLIK/SUMBER_DAYA_ALAM_DAN_LINGKUNGAN/MapServer/33
- KKP SIDAKO map: https://sidako.kkp.go.id/sidako/map
- KKP Decision 28/2026: https://jdih.kkp.go.id/Homedev/DetailPeraturan/7029
