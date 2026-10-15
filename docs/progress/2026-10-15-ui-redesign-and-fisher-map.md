# Progress: UI redesign and fisher map features

**Date:** 15 October 2026 (Asia/Jakarta)

## Context

The UI was restyled after the "NAKHODA Mockup Peran" design (fisher: mobile-first map, government: desktop dashboard). The fisher page was then simplified, and the map gained zoning and distance logic. A score-explanation panel (front/chlorophyll bars) was tried and removed as too much information for fishers. Product scope is unchanged: reports, email, trips, and case review remain legacy code outside the main navigation.

## Implemented

### 1. Visual system (all pages)
- Design tokens in `app/globals.css`: navy `#0b2a3c`, teal `#0b7a84`, pale sea `#eef4f5`, plus green/amber/red tints for status. Every existing class name was kept, so legacy views inherit the look.
- Fonts via `next/font/google` in `app/layout.tsx`: Bricolage Grotesque (headings) and Plus Jakarta Sans (body). Theme colour updated in `app/layout.tsx` and `app/manifest.ts`.
- App shell (`components/PesisirApp.tsx`): navy sidebar with icons and `aria-current` on the active page; navy top bar on phones; icon bottom navigation; online/offline dot. Unicode glyph icons (◉ ⌖ ▥) were replaced by inline stroke SVG icons.
- Login: navy background, portal cards with icon tiles.
- Map colours (`components/MapView.tsx`) aligned with the palette: highest cells `#14876b`, other measured cells `#8fd0b4`, core zone `#c8553d`, marine protection `#8a5a9e`, utilisation `#f0c24b`.
- Fix: `overflow-x:hidden` on `html, body` broke the sticky sidebar; changed to `overflow-x:clip`.

### 2. Simplified fisher page (`components/FisherPortal.tsx`)
- Map-first layout: full-height map with a floating three-item legend; a bottom sheet on phones and a 380 px side panel on desktop.
- The sheet shows the selected cell only: coordinates, score pill, four tiles (sea temperature, chlorophyll, data time, zoning), #1/#2/#3 shortcuts, and the GPS button.
- The safety disclaimer is one line on the main screen. The full zoning/mask notes, pre-trip checklist, quality flags, and external map link moved into a collapsible "Tentang data & keselamatan". No disclaimer content was removed.
- Phone fixes: map reduced to 44 dvh so the GPS button is visible above the bottom navigation; the OpenStreetMap attribution is lifted above the sheet.

### 3. Map logic
- New pure helpers in `lib/geo.ts` (no new dependency): `pointInArea` (ray casting, Polygon/MultiPolygon with holes), `zoneAt`, `cellZoneTypes` (samples 9 points per 0.05° cell, approximate), `distanceKm` (haversine), `bearingDeg`, `compassId` (8 Indonesian compass words).
- **Zone-aware recommendations:** cells that touch a BIG core zone (`Inti`) stay visible but are excluded from #1/#2/#3, from the "highest" colour, and from "nearest good". A selected cell that touches any zone shows a red (core) or amber (other zones) notice.
- **GPS zone alert:** when the on-device position is inside a BIG zone, a banner says which zone. The wording stays explicit that the layer is a BIG reference and unverified.
- **Distance and direction:** with GPS on, the sheet shows "X km · arah … dari posisi Anda". A "Terdekat yang bagus" button jumps to the nearest cell in the top 20% of recommended cells (minimum 3).
- **Selected cell highlight:** `MapView` accepts `selectedId` (navy outline layer `environment-selected`) and `focus` (eases to the cell when picked from the sheet).

## Verification
- `npm test`: 5 tests pass, including 3 new geo tests (holes, multipolygons, cell overlap, distance, compass).
- `npm run typecheck` passes; `npm run lint` reports the same 4 pre-existing warnings; `npm run build` passes.
- Local browser, desktop and 375×812: fisher and government quick entry, sticky sidebar, bottom sheet, #2 selection highlight and pan. GPS was simulated by overriding `navigator.geolocation` inside a core-zone polygon (`big-342`) to check the zone banner, distance line, and nearest-good button. Real-device GPS over HTTPS is still unchecked.
- Browser checks created anonymous quick-entry users in Supabase.

## Not done / suggestions
- Wave and weather safety data (BMKG maritime forecast or Copernicus wave `VHM0`) before showing any "safe to sail" status.
- The index is relative per day, so a "best" cell always exists; add absolute thresholds and a "no standout area today" state.
- Coastal Teluk Jakarta chlorophyll can be inflated by turbid/eutrophic water; down-weight or flag near-shore cells and gap-filled L4 values.
- Multi-day front persistence, a per-cell confidence level, boat range (distance from home port), and score trend vs. the previous acquisition.
- Offline cache of the last cell response (Dexie) and coordinate copy in degrees-minutes for GPS plotters.
- Validate the index against catch reports or fishing-activity data before presenting it as anything beyond environmental exploration.
- The government dashboard was restyled but not yet simplified.
