# Progress: Government problem map and fisher reports

**Date:** 16 October 2026 (Asia/Jakarta)
**Status:** Implemented locally; not committed or pushed.

## Context

The government dashboard only listed satellite observations and generic next steps. The team asked to follow the "Petugas · Peta masalah" and "Detail laporan dan validasi" mockups. Those screens need fisher reports, so fisher reporting is back in the main navigation. Only real data is shown: no sample-data mode, and empty states say so.

## Implemented

### Fisher side
- Navigation: **Peta**, **Lapor** (`/reports/new`), **Laporanku** (`/reports`), **Akun**. The existing offline-first `ReportForm` and `ReportList` logic (Dexie drafts, photo compression, sync, text-only reason) is unchanged.
- `ReportForm` restyled after the mockup: dashed photo picker (camera on phones), category chips, location card with "Gunakan lokasi saya" and collapsible manual coordinates, note, privacy line.
- Manual coordinates are checked in the form with `coordinateIssue` (`lib/review.ts`, tested). Swapped latitude/longitude, a positive latitude for a point south of the equator, and points outside the pilot box get a specific message instead of only "Gagal dikirim"; when the intended point is obvious, a one-tap fix fills the corrected pair. The submit button refuses such coordinates before calling the API.
- `ReportList` shows a contribution summary, unsent drafts, and per-report cards with a three-step progress (Diterima → Dicek petugas → Terverifikasi/Ditutup) and the officer's public note. `ReportDetail` shows the same steps.
- Category and status labels live in `lib/review.ts` and are shared by both sides.

### Access
- `lib/server.ts`: an anonymous **Masuk Cepat → Pemerintah** session gets the `reviewer` role for the pilot area only while `QUICK_LOGIN_FULL_ACCESS=true`. Quick fisher sessions stay `fisherman`. Anonymous reviewers skip the `area_memberships` lookup but are refused for any area other than the pilot. Anyone who opens the government door during that window can change real report statuses; switch the flag off after judging.

### API (`lib/api.ts`)
- `GET /api/review/reports`: submitted reports in the pilot area from the last 90 days with photo counts, plus published observations from the last 60 days. Author ids are never selected.
- `GET /api/review/reports/:id`: report (author, area and client ids stripped), its 0.05° cell, photo ids (images still come from the existing signed-URL route), field validation, linked case, other reports in the same cell (60 days), observations within one cell and ±30 days, and audit history.
- `POST /api/review/reports/:id/status`: `under_review`, `needs_information`, `corroborated`, `unsubstantiated` or `closed`, with an optional public note and revision check. It moves the linked case (created by the existing `open_case_for_report` trigger) only while that case is still `new`, `reviewing` or `ready_for_referral`, and writes an audit event.

### Rules (`lib/review.ts`, tested in `tests/review.test.mjs`)
- Cells are 0.05° (~5.5 km), lettered west→east and numbered north→south (e.g. `I11`).
- Satellite indication: NOAA 7-day alert ≥ 2 (Warning) or Sentinel-2 `candidate_pixel_count` > 0. Labelled as an indication, never proof.
- Cell level: **Bermasalah** = a verified report, ≥ 2 open reports, or an open report with a satellite indication; **Perlu dicek** = one open report or a satellite indication alone; otherwise uncoloured ("not yet indicated", not "good").
- Confidence: one point each for a photo, another report in the same cell, a satellite indication → rendah / sedang / tinggi, with the missing items listed.

### Screens
- `/government` **Peta masalah wilayah**: category/status filters, four counts (open reports, in verification, problem cells, verified), map of coloured cells with open-report counts (click a cell or count to filter the list), latest reports, and a compact satellite-source section linking to Kesehatan data.
- `/government/reports` **Laporan masuk** with the same filters.
- `/government/reports/:id` detail: photos or text-only reason, report facts with the reporter hidden, "Validasi vs satelit" (satellite vs fisher reports, explicit "no data" state), confidence bar, officer actions with a public note, link to the existing case/referral page, and history.
- `MapView`: additive `problem-fill`/`problem-outline` layers and optional `count` on pins.

## Verification
- `npm test`: 14 pass (4 new review-rule tests). `npm run typecheck` passes. `npm run lint`: 5 warnings; the new one is the same `<img>` warning as the existing three (signed photo URLs expire after 60 s, so `next/image` does not fit).
- `npm run build` passes.
- Browser (production build): fisher Lapor and Laporanku pages; government quick entry showed the real data (one existing `[UJI HACKATHON]` report in cell I11 and two cells with satellite indications), the problem map, the report list, and the detail page with "Tidak ada data" satellite state, low confidence, and history. Phone width has no horizontal scroll.
- End-to-end test (with the user's approval, 16 Oct): a fisher quick session submitted one text-only report labelled `[UJI]` (Sampah laut, -5.862, 106.605, cell F11). It appeared in Laporanku as "Baru · Diterima". A government quick session then ran Mulai verifikasi → Minta foto/info (refused without a note, accepted with one) → Tandai terverifikasi → Tutup laporan. Each step updated the status pill and history, including the note. While verified, the dashboard counted 1 problem cell and drew F11 red. After closing, the linked case `d8571c22` showed `closed_without_resolution`. The test report is left closed in Supabase (report `910735b9-fb9d-4b21-b92f-77c3ccc913ba`).
- The first submit returned `401 invalid_session` from `auth.getUser` although `/api/me` succeeded with the same token just before; the immediate retry succeeded. Looks transient on the Supabase Auth side, but worth watching during the demo: the form keeps the draft and the button can be pressed again.
- Several anonymous quick-entry users were created during checks.
