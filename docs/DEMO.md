# Nakhoda hackathon demo — 15 October 2026

## Nelayan

1. On the entry screen, choose **Masuk sebagai Nelayan**. No email or password is needed.
2. Open the map and press **Tampilkan lokasi saya**. Permit browser GPS. The blue dot and accuracy label show the device's current position; **Hentikan GPS** removes it. Do this on HTTPS or localhost.
3. Point out the color legend: the green grid shows every eligible 0.05° sea cell in the latest Copernicus Marine SST/chlorophyll pair, with darker green for the highest relative 40%; red, purple, and amber polygons are northern national-park zones from BIG. Tap a polygon to see its source zone label, or a green cell to see its date, SST, chlorophyll, relative index, and quality flags. Green is not fishing permission or a catch prediction.
4. Open the linked KKP conservation map to check restrictions manually. Explain that the current BIG layer does not cover the 2026 South Kepulauan Seribu designation and that zone-specific activity rules have not been validated for operational guidance. Uncolored water is unclassified, not automatically open to fishing. Check weather and vessel safety separately.

## Pemerintah

1. Sign out and choose **Masuk sebagai Pemerintah**. This opens the ecosystem dashboard directly, with no email or password.
2. Review the counts of published heat-context observations, optical changes, fresh sea-condition cells, and source checks. Open an observation to inspect its provider, acquisition time, algorithm, quality flags, and limitations.
3. Walk through the **Langkah berikutnya** cards: validate official zoning, examine heat context, investigate optical changes, and collect missing mangrove, abrasion, and waste measurements. These are proposed verification actions, not claims that damage has been proven.
4. Open **Kesehatan data** and compare source-check times with usable observation times. In GitHub Actions, show the separate Marine/Sentinel runs and `discovery-metadata` artifact to verify actual source IDs and errors.

## Acceptance boundaries

- Enable Anonymous Sign-Ins in Supabase and use its publishable key in `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The two portal buttons appear by default on every clone. Anonymous government entry can read the pilot dashboard and source health; it cannot administer users or edit legacy review cases.
- Map tiles need network access. GPS is optional and browser-only. Neither is proof of marine safety.
- No verified conservation polygons, catch validation, or direct mangrove/abrasion/waste datasets are present yet. Do not label an area as approved for fishing or a habitat as damaged on these data alone.
- Email, field reports, and case review are outside the primary judging path.
