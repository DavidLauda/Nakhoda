# Nakhoda

Nakhoda is a Bahasa Indonesia hackathon PWA for a Teluk Jakarta and Kepulauan Seribu coastal pilot. It has two independent quick-entry flows:

- **Nelayan:** a real map, optional on-device GPS position, colored conservation reference polygons for the northern national park, and dated SST/chlorophyll cells. The existing layer is 0.05°; a separately triggered measured 0.01° pilot can replace it after publication. The relative environmental index is experimental and does **not** prove fish abundance, safe passage, or permission to fish.
- **Pemerintah:** an ecosystem dashboard summarizing published satellite and ocean data, source health, gaps, and evidence-based next steps. Heat-stress context and optical changes require field verification before any restoration claim.

Email delivery, field reports, trip tracking, case review, and administration remain in the code as legacy pilot features, but they are not in the primary navigation or demo flow. The current priority is the fisher map and ecosystem dashboard.

## Local start

1. Install Node.js 22+ and run `npm ci`. For the satellite pipeline, also install Python 3.12+ and `python -m pip install -r pipeline/requirements.txt`.
2. Create a Supabase project, enable PostGIS, and apply `supabase/migrations/202610140001_initial.sql`.
3. Copy `.env.example` to `.env.local` **on each computer running a clone**. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the project's **publishable** key (`sb_publishable_...`), and `SUPABASE_SERVICE_ROLE_KEY` to the server-only key. Never put `sb_secret_...` or a legacy service-role JWT in a `NEXT_PUBLIC_` variable. If a secret key was previously used in the browser, rotate it in Supabase. Set `APP_BASE_URL` to the deployment URL.
4. Enable Supabase **Anonymous Sign-Ins** for that project. Run `npm run dev`, open `http://localhost:3000`, and choose **Masuk sebagai Nelayan** or **Masuk sebagai Pemerintah**. Quick login is the default on every clone; it needs no extra flags, email, or password. Each button creates an anonymous Supabase session and selects the corresponding portal. Sign out to switch portals. The government quick-entry portal can read pilot source health, but anonymous sessions do not gain case-review or administrator permissions.
5. The map uses OpenStreetMap standard raster tiles by default with attribution. `NEXT_PUBLIC_MAP_STYLE_URL` can override the basemap with a licensed MapLibre style. Follow the [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/) if using the default; tiles require an internet connection and are not bulk-cached by the PWA.

## Data and limits

The Python pipeline supports NOAA Coral Reef Watch, Copernicus Marine SST/chlorophyll, and CDSE Sentinel-2. A scheduled or manual GitHub Actions run records source checks and, when configured with Supabase credentials, publishes qualifying results. `pipeline/config/pilot.json` defines the current study envelope. Run sources independently with `python -m pipeline.run --source noaa|marine|sentinel`; inspect Actions logs, `discovery-metadata`, acquisition dates, source IDs, quality flags, and `analysis_runs` before presenting a result.

An **experimental, manually triggered** `marine-highres` workflow uses Copernicus Marine OLCI chlorophyll and CDSE Sentinel-3 SLSTR SST to publish only quality-screened, paired observations on a 0.01° (~1.1 km) grid. It never subdivides the 0.05° source cells. In addition to the existing Marine credentials and Supabase service key, this workflow needs GitHub Actions secrets `CDSE_USERNAME` (the CDSE login email) and `CDSE_PASSWORD`; the existing `CDSE_CLIENT_ID`/`CDSE_CLIENT_SECRET` are for Sentinel Hub and do not authenticate OData product downloads. Run the new source from **Actions → Satellite pilot pipeline → Run workflow → marine-highres** only after those secrets are configured. A local non-publishing discovery run is `python -m pipeline.highres_run --env-file .env.local`; publication requires the explicit `--publish` flag. The app falls back to the latest existing 0.05° cells when there is no high-resolution publication within seven days. See [16 October high-resolution progress](docs/progress/2026-10-16-high-resolution-copernicus-pilot.md).

The fisher map includes six northern Taman Nasional Kepulauan Seribu polygons from [BIG's public conservation-zoning layer](https://kspservices.big.go.id/satupeta/rest/services/PUBLIK/SUMBER_DAYA_ALAM_DAN_LINGKUNGAN/MapServer/33), retrieved 15 October 2026. They are colored by the source labels Inti, Perlindungan Bahari, and Pemanfaatan. The layer does not state a current revision date and cannot certify an activity permission. The [KKP SIDAKO conservation map](https://sidako.kkp.go.id/sidako/map) remains the manual reference. The KKP's [Decision 28/2026 for South Kepulauan Seribu](https://jdih.kkp.go.id/Homedev/DetailPeraturan/7029) is not represented by these polygons; its operative geometry and rules still need authoritative GIS validation. The app marks no area “legal to fish” or “safe to fish.”

The environmental index ranks conditions within available cells and is not a catch forecast. Optical differences are not a diagnosis of coral damage. There are no dedicated live mangrove-damage, shoreline-abrasion, or marine-waste measurements in this pilot. The government dashboard names those gaps and proposes data collection rather than inventing metrics. GPS is requested only when the fisher presses **Tampilkan lokasi saya** and stays in the browser; it is cleared when tracking stops or the page unmounts. GPS requires HTTPS or localhost and is not a navigation instrument.

## Checks and documentation

Run `npm run typecheck`, `npm run lint`, `npm run build`, and `npm test`. Pipeline tests are `python -m pytest -q pipeline/tests` when Python dependencies are available. See [demo flow](docs/DEMO.md), [quick-login setup for clones](docs/progress/2026-10-15-quick-login-for-all-clones.md), [algorithm contract](docs/ALGORITHMS.md), [source notes](docs/SOURCES.md), [conservation map progress](docs/progress/2026-10-15-zone-visualization.md), and [Copernicus grid progress](docs/progress/2026-10-15-copernicus-grid-zoning.md).

Keep service-role, provider, and Gmail credentials out of chat, screenshots, client-side variables, and Git. Gmail configuration is optional for the current demo.
