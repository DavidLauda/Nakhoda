# Progress: Quick login as the default for every Nakhoda clone

**Date:** 15 October 2026 (Asia/Jakarta)

## Problem

A teammate's independent clone showed the old email/password form. That form appeared whenever `NEXT_PUBLIC_QUICK_LOGIN_ENABLED` was absent or false in that computer's `.env.local`. The screenshot also showed `Forbidden use of secret API key in browser`, indicating a secret Supabase key was used where the browser needs a publishable key. A clone has its own environment file; this repository intentionally does not commit credentials.

## Changes

- The entry page always offers **Masuk sebagai Nelayan** and **Masuk sebagai Pemerintah**. The email/password form and both quick-login flags are removed from the active flow.
- Both buttons use Supabase Anonymous Sign-Ins, so visitors enter without an email or password. The selected portal is recorded in the temporary anonymous session.
- Anonymous government sessions can read the pilot dashboard and a limited set of source-health fields. Their effective API role remains `fisherman`, so the old case-review and administration endpoints cannot be unlocked merely by choosing the government portal.
- The Next.js configuration rejects a `sb_secret_...` key or legacy service-role JWT in `NEXT_PUBLIC_SUPABASE_ANON_KEY` before development/build starts. The browser client also refuses an `sb_secret_...` key.
- Updated setup and demo instructions for independent clones.

## Verification

- `npm run typecheck`, `npm test`, and `npm run build` passed; lint completed with zero errors and four existing warnings.
- A test build with a fake `sb_secret_...` public key failed with a clear configuration error, without printing the key.
- In the local production build, both entry buttons appeared. **Masuk sebagai Pemerintah** opened the real dashboard with 145 current sea cells, and **Kesehatan data** displayed source runs. [Screenshot of the entry page](assets/2026-10-15-quick-login-all-users.png).

## Steps for a teammate running a clone

1. Pull the latest `main`, run `npm ci`, and restart `npm run dev`. Old `NEXT_PUBLIC_` values are baked into an existing build, so rebuild if using `npm run build` / `npm run start`.
2. In that computer's uncommitted `.env.local`, set `NEXT_PUBLIC_SUPABASE_URL` and put the project's `sb_publishable_...` key in `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Put the secret/service-role key only in `SUPABASE_SERVICE_ROLE_KEY` (no `NEXT_PUBLIC_` prefix). Never paste key values into chat or commits.
3. Enable **Anonymous Sign-Ins** in the matching Supabase project. If a secret key was already placed in a browser variable and the app was run, rotate that key in Supabase.
4. Open the app and choose either portal. These backend connection values are configured once per cloned server; each visitor then enters without an email or password.

## Scope

Quick login is open to all visitors of a correctly configured running app. It still uses temporary Supabase sessions to fetch live pilot data. The primary Nelayan and Pemerintah flows require the shared backend connection; an unconfigured standalone clone cannot load Supabase data.
