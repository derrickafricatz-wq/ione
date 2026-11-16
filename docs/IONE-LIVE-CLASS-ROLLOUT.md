# I|ONE Live Class — rollout and verification notes

This feature is intentionally isolated on `feature/ione-live-class-foundation`. It is not merged or deployed to the live I|ONE site.

## What is included

- A homepage tile and separate Live Class catalogue.
- Recorded training drafts with resumable Cloudflare Stream TUS uploads.
- A hard 60-minute maximum for recorded training, enforced by Cloudflare Stream and the database.
- Scheduled live broadcasts require start/end times, are capped at six hours, reject early/late joining, and stop automatically at the scheduled end.
- Browser-based one-instructor live broadcasts using Cloudflare Stream WebRTC (WHIP publishing and WHEP playback), directly from the instructor's camera and microphone.
- Short-lived signed playback tokens for both recorded lessons and WebRTC live inputs.
- Authority Press create, list, publish and suspend controls.
- Server-side signed playback tokens. The browser never receives the Cloudflare API token or signing private key.
- Isolated Supabase tables for classes, paid enrollments and attendance, all protected by RLS with no direct browser-role table grants.
- Browser Back / Android Back integration and PWA cache/version updates.

## Not yet enabled

1. **Paid checkout:** the UI displays prices, but paid access is deliberately denied until the I|ONE training payment flow is connected to a confirmed provider and writes a verified paid enrollment. No existing book, documentary, transport or other payment function is reused or changed.
2. **Interactive classroom:** the tab is present as a planned experience, but camera/microphone multi-participant rooms are not active. This requires a separate realtime media integration and its own testing.
3. **Live replay:** Cloudflare Stream WebRTC currently does not support automatic recording or HLS/DASH replay for the same live input. If a replay is needed, the instructor must upload a separate recorded lesson after the session.
4. **Production streaming:** no Cloudflare Stream live input or upload has been created by this change. The feature remains unavailable until the required account secrets are configured and the end-to-end test is completed.

## Required Supabase Edge Function secrets

Configure these on the dedicated `ione-live-class` function only:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_STREAM_API_TOKEN` — scoped to Cloudflare Stream Read and Write permissions needed to create uploads/live inputs and read media state. Signed playback tokens are generated server-side using the private signing JWK.
- `CLOUDFLARE_STREAM_SIGNING_KEY_ID`
- `CLOUDFLARE_STREAM_SIGNING_KEY_JWK_B64` — the base64-encoded private JWK returned by Cloudflare when the signing key is created. Store it as a secret; it contains private key material.

Create the Stream signing key once using `POST /accounts/{account_id}/stream/keys` with the Stream Write API permission. Save the returned `id` and `jwk` values immediately; Cloudflare displays the private key only once.

Never put any of these values in `index.html`, JavaScript assets, GitHub commits, or public Supabase configuration.

## Safe rollout order

1. Review the migration and Edge Function source in this branch.
2. Apply the migration to a non-production Supabase branch/database first. Do not apply it to production as part of this PR.
3. Deploy `ione-live-class` as a new, separate Edge Function with JWT verification disabled because public catalogue requests are supported; all Authority mutations still require a valid, unexpired Authority Press session, and paid playback independently validates the user's bearer token and a paid enrollment.
4. Configure the four Cloudflare Stream secrets.
5. Test a free recorded lesson upload, verify its processing state, publish it, and verify signed playback.
6. Test a scheduled live input from the instructor's phone camera and microphone, confirm WHEP playback on a second device, stop the broadcast, then suspend the class.
7. Confirm the no-replay limitation is clearly communicated; test uploading a separate replay as a recorded lesson.
8. Connect the selected training payment provider and verify the paid enrollment webhook/server-side confirmation before enabling paid classes.
9. Complete the interactive classroom stage separately.
10. Run the existing I|ONE regression checks and a real Android installed-PWA Back-navigation test.
11. Only after the tests pass, request review and decide whether to merge/deploy.

## Manual test checklist

- Homepage opens normally and the new tile opens only the Live Class overlay.
- Recorded, Live Broadcast and Classroom tabs render without affecting other features.
- Android system Back and browser Back close the correct Live Class layer.
- Authority Press can create a draft only with an active Authority session.
- A recorded upload is resumable, rejects videos over 60 minutes, and cannot be published until Stream reports it ready.
- A live broadcast draft requires a valid start/end schedule (maximum six hours) and a provisioned live input before publication.
- The instructor can start and stop the camera/microphone broadcast from the browser; the client stops it at the scheduled end.
- The private WHIP publishing URL is returned only to a verified Authority session, kept in memory by the instructor's browser, and never saved in a public table or returned by public catalogue actions.
- Free playback receives a short-lived signed token; paid playback fails unless a verified, unexpired enrollment exists.
- Suspended classes disappear from the public catalogue.
- Existing Documentary, Shelf, payments, Transport, Sokoni, Mama Chakula, Mini Market and Opportunities regressions remain clean.

## Cost and deployment guard

Cloudflare Stream WebRTC delivery is usage-billed at the standard Stream delivery rate (currently $1 per 1,000 minutes delivered); billing for WebRTC began October 15, 2026. WebRTC live inputs do not incur recording storage because they are not automatically recorded. This branch does not create Stream resources, activate a plan, add secrets, deploy an Edge Function, apply a production migration, merge to `main`, or publish a GitHub Pages update. See [Cloudflare's WebRTC documentation](https://developers.cloudflare.com/stream/webrtc/) and [pricing guidance](https://developers.cloudflare.com/stream/pricing/). Complete a small controlled test and review expected usage before enabling production streaming.
