# Honest pilot demo sequence

Until accounts exist, start `npm run dev` and show `/source-probe`: genuine 12 October 2026 NOAA fields, native grid cell, exact asset IDs and SHA-256s. Point out the banner saying this is locally processed and **not** in the authenticated live map. Show `/api/health` and the setup state. Do not imply the current prototype has sent email or processed a Sentinel scene.

After completing the README setup checklist, verify the following on a hosted HTTPS build using two fishermen and one assigned reviewer:

1. Manually dispatch the Actions workflow for NOAA and inspect the run, database `analysis_runs`, source assets, observation dates and quality flags. Run CDSE and Marine separately, recording any valid pair or explicit unavailable reason. A no-new-data check is not an optical demonstration.
2. Sign in as fisherman A. Open a genuine published observation and read the source time and limitations. Start a foreground trip; show current position/accuracy. Enable approximate sharing separately.
3. Sign in as fisherman B on another device. Verify a rounded marker and active-participant count, with no access to A's precise trip points. Disable A's sharing and verify the marker disappears; repeat after three-minute expiry.
4. Create a report with actual location, observation time and photo, linked to a genuine indication. Disconnect before final submission, reload, and show the local/pending label. Reconnect/reopen and use **Sinkronkan sekarang**. Verify exactly one server report, private photo and preserved observation time.
5. Sign in as the assigned reviewer. Open the case and photo, examine satellite source IDs, field stance and distance/time mismatch. Update status with a reason and inspect the audit event and reporter-visible follow-up.
6. Use the team-controlled recipient directory and `EMAIL_MODE=test`. Preview the exact **From**, **To**, subject and full body. Send once through Gmail API. Record the outbox provider message ID, then check the team's inbox separately for receipt. Never send to an institution merely for this demonstration.
7. On Android, install the HTTPS PWA, open it from its icon, then test cached shell and an offline draft. State that browser tracking can pause when hidden or locked.

If a source, account, or connection is unavailable, show the exact missing-data state and mark the corresponding acceptance test incomplete. Historical dates must remain historical. Environmental ranking is an unvalidated relative index; optical difference is not a coral-damage diagnosis.
