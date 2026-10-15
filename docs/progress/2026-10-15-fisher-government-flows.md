# Progress: Separate fisher and government flows

**Date:** 15 October 2026 (Asia/Jakarta)

## Product direction

The hackathon focus is traditional fishers facing reef and mangrove degradation, shoreline abrasion, marine waste, declining catch, and coastal vulnerability. The primary product now consists of a fisher map and a government ecosystem dashboard. Email and field reports have been removed from the main navigation and demo path.

## Implemented

- Two separate quick-entry buttons create anonymous sessions marked `fisherman` or `government`. Server identity maps the fisher portal to a fisher role and the government portal to a pilot reviewer role when the hackathon full-access flag is on. Anonymous government users do not receive the administrator role.
- The fisher map now loads a geographic basemap without extra map configuration, displays recent SST/chlorophyll environmental points, and shows the fisher's on-device GPS position only after permission. The current point shows acquisition time, quality flags, and zoning status.
- The government dashboard summarizes published heat context, optical changes, fresh ocean cells, and source checks. It displays actual observation points and dynamically worded verification/next-step cards.
- The primary navigation is different for each portal. Reports, email, trips, and case handling remain as legacy code but are not part of the main flow.
- Demo and README were rewritten for the revised judging path.

## Data integrity and remaining work

- No verified conservation-zone polygons are available in the repository. The current two study squares are not legal fishing zones. The UI links to the official KKP SIDAKO map and does not assert that any point is permitted for fishing. Importing current authoritative polygons with zone-specific activity rules is still necessary for automated avoidance.
- The relative environmental index is not validated against catch; it must not be presented as an optimal-catch prediction. The current government data does not directly quantify mangrove damage, abrasion, or marine waste.
- Local production build was opened in a browser. Both quick-entry buttons, portal navigation, live Supabase data, and OpenStreetMap basemap/attribution rendered. GPS permission and accuracy still require a real-device HTTPS check. Confirm up-to-date provider acquisition times and quality flags before judging.

## Verification

- `npm run typecheck` passed.
- `npm run lint` passed with four existing warnings (three raw image elements in legacy views and one legacy hook dependency).
- `npm run build` passed.
- `npm test` passed (2 tests).
- Local browser: Nelayan quick entry displayed 5 recent environment points dated 14 October 2026 with unverified zoning; Pemerintah quick entry displayed 1 published optical observation, 5 recent sea cells, and source health. Both flows showed their own primary navigation.

## Sources

- KKP SIDAKO conservation map: https://sidako.kkp.go.id/sidako/map
- KKP Decision 28/2026 (South Kepulauan Seribu conservation area): https://jdih.kkp.go.id/Homedev/DetailPeraturan/7029
- OpenStreetMap tile usage policy: https://operations.osmfoundation.org/policies/tiles/
