# Honest pilot demo sequence

For juror self-service, enable Supabase **Anonymous Sign-Ins** and set `NEXT_PUBLIC_DEMO_GUEST_ENABLED=true` in the deployed app. The login screen then leads with **Masuk sebagai tamu demo**. This creates a separate fisherman account for each browser without sending email; the team-only email login remains under **Masuk akun tim** for reviewers and admins. Guest accounts cannot be recovered after sign-out or browser-data removal, and they cannot access reviewer/admin routes. Anonymous sign-ins use the `authenticated` database role, so review RLS and rate limits before enabling them. [Supabase guidance](https://supabase.com/docs/guides/auth/auth-anonymous)

The `/source-probe` page remains a separate, locally processed NOAA record and cannot stand in for published Supabase observations. The Marine and Sentinel pilot runs have published data; show their actual dates, quality flags and limitations instead of presenting them as verified coral damage or current fishing guidance.

After completing the README setup checklist, verify the following on a hosted HTTPS build using two fishermen and one assigned reviewer:

1. Manually dispatch the Actions workflow for NOAA and inspect the run, database `analysis_runs`, source assets, observation dates and quality flags. Run CDSE and Marine separately, recording any valid pair or explicit unavailable reason. A no-new-data check is not an optical demonstration.
2. Sign in as fisherman A. Open a genuine published observation and read the source time and limitations. Start a foreground trip; show current position/accuracy. Enable approximate sharing separately.
3. Sign in as fisherman B on another device. Verify a rounded marker and active-participant count, with no access to A's precise trip points. Disable A's sharing and verify the marker disappears; repeat after three-minute expiry.
4. Create a report with actual location, observation time and photo, linked to a genuine indication. Disconnect before final submission, reload, and show the local/pending label. Reconnect/reopen and use **Sinkronkan sekarang**. Verify exactly one server report, private photo and preserved observation time.
5. Sign in as the assigned reviewer. Open the case and photo, examine satellite source IDs, field stance and distance/time mismatch. Update status with a reason and inspect the audit event and reporter-visible follow-up.
6. Use the team-controlled recipient directory and `EMAIL_MODE=test`. Preview the exact **From**, **To**, subject and full body. Send once through Gmail API. Record the outbox provider message ID, then check the team's inbox separately for receipt. Never send to an institution merely for this demonstration.
7. On Android, install the HTTPS PWA, open it from its icon, then test cached shell and an offline draft. State that browser tracking can pause when hidden or locked.

If a source, account, or connection is unavailable, show the exact missing-data state and mark the corresponding acceptance test incomplete. Historical dates must remain historical. Environmental ranking is an unvalidated relative index; optical difference is not a coral-damage diagnosis.
