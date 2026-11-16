# BLMPay V2 Migration — Test and Security Addendum

This addendum supplements `docs/blmpay-v2-migration-audit.md`. It is preparation only; no production function was changed or deployed.

## Hardened V2 signer

The helper at `supabase/functions/_shared/blmpay-v2.ts` now rejects any target outside the `/api/v2/` namespace, including absolute or protocol-relative URLs, fragments, whitespace/control characters and backslashes. This reduces the risk of signing one target while sending a different route.

## Isolated unit tests

Tests are in `supabase/functions/_shared/blmpay-v2_test.ts`. They cover:
- Official BLMPay host and V2 route restrictions.
- Required authentication/origin/content-type/idempotency headers.
- Timestamp and nonce formats.
- Recomputing the HMAC-SHA256 signature from the exact canonical request.
- Invalid idempotency keys and insecure or path-bearing origins.

Run from a Deno environment with only the test environment variables permitted:

```sh
deno test --allow-env=BLMPAY_V2_API_KEY,BLMPAY_V2_HMAC_SECRET supabase/functions/_shared/blmpay-v2_test.ts
```

These tests were added but not executed in this environment and do not replace validation against an official BLMPay V2 sandbox/test endpoint.

## Additional production log risk observed

Inspection of the currently deployed `create-blmpay-payment` function found logging of the raw inbound request body, a prefix of the BLMPay credential, the constructed payment payload, and the full provider response. These logs may expose customer phone numbers, metadata or payment details. Remove these logs in a separate, reviewed security patch and replace them with sanitized event IDs/status codes. Do not mix this cleanup into an unverified V2 migration or deploy a replacement based on stale repository code.

## Still required before migration

- Official, authoritative V2 payment/status response schemas and payout fee, name-lookup, send, and status contracts.
- V2 credentials configured in Supabase Edge Function secrets, never in GitHub or frontend code.
- Reconciliation of deployed function source with the repository.
- Successful local unit tests and provider-side test validation.
- A one-function-at-a-time rollout with a tested rollback plan.

Public BLMPay documentation currently still identifies itself as API V1: https://pay.blmtec.co.tz/developer/docs. Do not infer V2 payout endpoints from V1 paths.
