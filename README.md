# Nakhoda pilot

Nakhoda is one responsive Bahasa Indonesia Next.js PWA for a fisherman and an assigned reviewer. Supabase Auth, PostGIS and private Storage hold the shared data; a scheduled Python job discovers and processes satellite products; a reviewed outbox sends through the Gmail API. The application uses genuine provider data only after the pipeline publishes it. An empty state is intentional when accounts or observations are missing.

This repository began empty on 14 October 2026. No Supabase project, GitHub remote, CDSE/Copernicus Marine account, Gmail OAuth client, sender, recipient, map style or deployment was supplied. The code is a **partial MVP until these are configured and the live acceptance checks pass**. No credentials belong in Git.

With no account configuration, run `npm run dev` and open `/source-probe` to inspect the real, locally processed NOAA record. It is labelled separately from the authenticated live observation map and cannot substitute for a published Supabase observation. See [demo sequence](docs/DEMO.md) and [completion report](docs/COMPLETION.md).

## Local start

1. Install Node.js 22+, Python 3.12+, and npm. Run `npm ci` and `python -m pip install -r pipeline/requirements.txt`.
2. Create a Supabase project on a plan for which your team is eligible. Enable the PostGIS extension and apply `supabase/migrations/202610140001_initial.sql` in the SQL editor or through the Supabase CLI. The migration creates private `report-media` and `analysis-artifacts` buckets.
3. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. The latter is server-only. Set `APP_BASE_URL` to the actual local/hosted URL. Do not put any secret in a `NEXT_PUBLIC_` variable.
4. Run `npm run dev` and open `http://localhost:3000`. For the hackathon demo, set `NEXT_PUBLIC_DEMO_GUEST_ENABLED=true` and enable **Anonymous Sign-Ins** in Supabase Authentication → Sign In / Providers after reviewing RLS and abuse controls. Visitors then use **Masuk sebagai tamu demo** without email; each gets a separate fisherman account. A guest cannot recover that account after signing out or clearing browser data. Keep reviewer and admin access on separate team-managed accounts. Bootstrap the first admin with `update public.profiles set role='admin' where id='<admin-auth-user-uuid>';` in the SQL editor. The admin page can assign subsequent roles and the pilot area to reviewers. Email registration remains available when guest mode is off and requires working confirmation email delivery.
5. Configure a licensed `NEXT_PUBLIC_MAP_STYLE_URL` if a geographic basemap is desired. Without it, the data list remains usable and the map explains the missing style. Keep any public map key restricted to your deployed app origin and follow attribution/usage terms.

## Manual setup checklist

| Input to supply | Where | Why |
|---|---|---|
| Supabase project URL, public anon key, service-role key | `.env.local`; Actions secrets for URL and service key | Auth, database, private media and published observations |
| Anonymous Sign-Ins enabled and `NEXT_PUBLIC_DEMO_GUEST_ENABLED=true` | Supabase Auth and app environment | One-click juror access without email; review RLS and rate limits first |
| GitHub repository and Actions enabled, actual minutes/spending controls | GitHub | Daily 03:17 UTC run and manual dispatch; no paid upgrade authorized |
| CDSE OAuth client ID/secret | Actions secrets `CDSE_CLIENT_ID`, `CDSE_CLIENT_SECRET` | Catalog and cropped Sentinel-2 Process requests |
| Copernicus Marine account username/password | Actions secrets `COPERNICUSMARINE_SERVICE_USERNAME`, `COPERNICUSMARINE_SERVICE_PASSWORD` | Bounded SST/chlorophyll subsets |
| Dedicated Gmail address, Google OAuth client ID/secret/refresh token with only `gmail.send` scope | Server env, never browser | Reviewed real outbound messages |
| Team-controlled test inbox address | `EMAIL_TEST_ALLOWLIST` and admin recipient directory | `EMAIL_MODE=test` blocks all other recipients; empty list blocks all sending |
| HTTPS Next.js host/provider subdomain and production env vars | Host | Installable PWA and authenticated API |
| Licensed map style URL | Public env | MapLibre basemap |
| Pilot AOI visual confirmation, habitat footprint/license, legal zoning | `pipeline/config/pilot.json` and vetted GIS import | Current squares are search areas, **not verified coral or legal fishing zones** |
| Institutional contacts and communication intent | Admin directory, only if/when live referral is intended | No institution should receive a test email |

## Pipeline

`python -m pipeline.run --source noaa` runs the public NOAA adapter locally. `--source marine`, `--source sentinel`, or `--source all` run the other sources independently. Source-specific run/quality states are written to `analysis_runs` when Supabase is configured. `pipeline/out/` holds short-lived local diagnostic metadata and is ignored by Git. Raw provider files are cached locally only during a run and never sent to the PWA. The workflow `.github/workflows/pipeline.yml` schedules daily discovery at 03:17 UTC (10:17 WIB), permits `workflow_dispatch`, limits concurrency to one and the job to 90 minutes. Its metadata artifact expires after three days.

The pipeline checks source IDs and result keys before expensive optical processing. Results are keyed by source IDs, AOI version and algorithm version. Assets upload before a manifest is published; a failed source does not erase last good records. Repeating an identical pair returns `no_new_data`. NOAA downloads are capped; CDSE requests are limited to two ~1–2 km study squares and at most 500×500 output pixels. Copernicus Marine requests cover only the pilot envelope and ten days. See [source selection](docs/SOURCES.md) and [algorithms](docs/ALGORITHMS.md).

If a source fails, inspect its `analysis_runs.error_code` and the GitHub run, correct credentials/configuration or wait for provider recovery, then dispatch the same source again. Verify its source asset IDs, dates, manifest and latest usable result before the demo. A provider check with no new scene is not proof that optical analysis ran; demonstrate a genuine documented pair separately.

## Gmail controlled test

Create a Google Cloud OAuth client for the dedicated team Gmail account, enable Gmail API, grant `https://www.googleapis.com/auth/gmail.send`, and obtain a refresh token under the team's control. Put the credentials only in server environment variables. Set `EMAIL_SENDER`, leave `EMAIL_MODE=test`, and place only the team's inbox in `EMAIL_TEST_ALLOWLIST`. Add that same address as a test recipient in `/admin`.

For a real test, submit a report, use an assigned reviewer to move the new case to `ready_for_referral` with a reason, choose the test recipient, inspect the full preview and exact addresses, and click **Kirim laporan yang ditinjau**. The outbox records `provider_accepted` and Gmail's message ID only after API success. Verify inbox receipt separately. An `unknown` send state requires checking the sender's Sent folder before any manual retry. A revoked/expired OAuth grant requires reconnection; testing-mode refresh tokens may be short-lived. Switching to `EMAIL_MODE=live` also requires an administrator-verified official recipient and a deliberate reviewed send; it is not needed for the hackathon test.

## Demo and checks

Run `npm run typecheck`, `npm run lint`, `npm run build`, `npm test`, and `python -m pytest -q pipeline/tests`. For the full demo, use two fisherman accounts and one assigned reviewer: record an active foreground trip, opt in/out of approximate sharing, submit an offline draft with photo and linked field stance, reconnect/sync, review the case, preview the team-only email, send once, and verify actual receipt. Show the GitHub run and observation dates; do not imply an old image is fresh. Test install/open on an Android device and hosted HTTPS integration separately. See [verification status](docs/COMPLETION.md).

## Privacy and limits

All API requests verify Supabase access tokens. Privileged routes additionally check role and pilot-area membership. RLS permits only owners to read precise trips/points and reports; other participants receive only server-rounded presence, expiring at read time after three minutes. Private photos and analysis imagery use brief authorized signed URLs. The browser stores per-account drafts and pending trip points in IndexedDB. Review and email require an online session. No browser background GPS promise is made. Precise trip deletion/retention automation and production abuse controls still need a deployment decision and further work.

The environmental number is an unvalidated relative index, not a catch probability. Optical differences cannot diagnose coral damage. No legal fishing-zone coverage is verified; all environmental cells remain exploration only. No purchase, paid worker, LLM, custom domain or native app is required.
