# BLMPay API V2 Migration Audit — I|ONE

**Status:** preparation only; no production functions changed, deployed, or used to send a payment/payout.  
**Target:** complete migration before BLMPay V1 sunset: **15 November 2026, 23:59 EAT**.  
**Repository branch:** `audit/blmpay-v2-migration`.

## Safety decision

Do not edit or deploy production payment functions as a bulk replacement. The deployed Supabase Edge Functions contain independent payment, reconciliation, and payout flows. The checked-in repository paths do not fully match the deployed function source, so deploying repository functions without reconciling that drift could overwrite working production behavior.

## Confirmed V1 callers in the deployed Supabase project

| Function | V1 behavior observed | Risk if migrated blindly |
| --- | --- | --- |
| `create-blmpay-payment` | Creates `POST /api/v1/payments`; logs the first 8 characters of its key | Payment initiation failure; credential prefix leak in logs |
| `ione-chapchap-payment` | Creates payment and checks `GET /api/v1/payments/{reference}` | ChapChap checkout and order reconciliation |
| `heavens-blmpay-payment` | Creates payment | Book/access checkout |
| `heavens-blmpay-donation` | Creates donation payment | Donation checkout |
| `heavens-blmpay-status` | Reads payment status | Access/donation status reconciliation |
| `heavens-blmpay-donation-status` | Uses V1 payment-status flow | Donation confirmation |
| `ione-chapchap-authority` | Checks payments; quotes fees, looks up recipients, sends and tracks payouts | Seller payout and Authority workflows |
| `ione-gift-support` | Looks up recipient and sends referral reward payout | Referral reward delivery |
| `ione-author-payouts` | Quotes, verifies, sends and reconciles author payouts | Author earnings and payout ledger |
| `blmpay-webhook` | Handles incoming payment events and performs V1 status fallback checks | Payment confirmation and duplicate/recovery handling |
| `ione-chapchap-webhook` | Handles ChapChap events and V1 status fallback checks | Order and payout state transitions |
| `heavens-blmpay-webhook` | Verifies incoming webhook signatures | Payment confirmation security |

Functions such as `ione-chapchap-seller` and `ione-chapchap-buyer` were not identified as direct BLMPay API callers in the inspected source; keep them out of the migration unless further tracing proves otherwise.

## V2 signing helper scaffold added

A non-production helper now exists at [`supabase/functions/_shared/blmpay-v2.ts`](https://github.com/derrickafricatz-wq/ione/blob/audit/blmpay-v2-migration/supabase/functions/_shared/blmpay-v2.ts). It implements Web Crypto SHA-256 body hashing, HMAC-SHA256 signing, Unix timestamp seconds, a 16-byte random nonce, origin validation, and idempotency-key validation.

Expected Supabase Edge Function secrets are `BLMPAY_V2_API_KEY`, `BLMPAY_V2_HMAC_SECRET`, and optionally `BLMPAY_V2_ORIGIN`. **Do not add credentials to GitHub.** The helper is not imported by or connected to any production function. It is a scaffold, not yet integration-tested against BLMPay.

For `POST /api/v2/payments`, the canonical request string from the supplied dashboard instructions is:

```text
POST
/api/v2/payments
<unix timestamp seconds>
<unique nonce>
<lowercase hex SHA-256 of the exact body string>
```

The signature is HMAC-SHA256 of that canonical string using the HMAC secret. Required headers include `Authorization: BLMPay-HMAC <API_KEY>`, `X-BLMPay-Timestamp`, `X-BLMPay-Nonce`, `X-BLMPay-Signature`, `X-BLMPay-Origin: https://intoione.space`, `Content-Type: application/json`, and a stable `Idempotency-Key`.

Implementation requirements:
- Sign the exact serialized body string sent to `fetch`; never serialize it a second time after signing.
- Keep API key and HMAC secret in Supabase Edge Function secrets only.
- Use a fresh nonce per request and a Unix timestamp in seconds.
- Reuse an idempotency key only for retries of the same attempt with the same body.
- Preserve existing payment types, amounts, customer fields, metadata, webhook URLs, order references, and frontend response contracts.
- Never log API keys, HMAC secrets, signatures, phone numbers, or raw payment payloads containing personal data.
- Add bounded timeouts and safe provider error handling without converting uncertain responses into “paid”.

## Status, payout and webhook migration must be separate

The supplied dashboard information confirms V2 payment creation and the payment list/single-payment paths, but the full V2 response schema and terminal status enum have not been verified. Do not change status parsing until actual V2 responses are checked safely.

The existing payout flows use V1 fee quote, recipient lookup, send, and payout-status routes. The available V2 material does not establish the corresponding payout paths, canonical targets, payloads, or response shapes. Do not invent payout routes or send live payouts as a test.

Outgoing V2 request authentication and incoming webhook authentication are separate mechanisms. Preserve existing webhook signature validation until BLMPay confirms the V2 webhook signing contract. Keep verified webhooks and status reconciliation idempotent.

## Staged rollout plan

1. **Credential readiness:** add V2 API key and HMAC secret as server-side Supabase secrets; keep V1 credentials available for rollback. Confirm the registered origin is `https://intoione.space`.
2. **Helper validation:** run unit tests for body hashing, HMAC, timestamp/nonce, idempotency validation, and origin checks; then validate against an authoritative BLMPay test/sandbox request.
3. **Payments first:** reconcile source drift, then migrate one payment-creation function at a time, preserving its request body and frontend response contract.
4. **Read/status flows:** verify actual V2 response fields and status enum before changing reconciliation. Test pending, completed, failed, expired/cancelled, malformed response, timeout, and retry scenarios.
5. **Payouts:** obtain the authoritative V2 fee/name-lookup/send/status contract before migrating each payout workflow independently.
6. **Webhooks:** preserve existing verification unless the official V2 webhook spec explicitly changes it; test duplicate delivery and fallback reconciliation.
7. **Release:** review diffs, deploy one Edge Function at a time, test safely, monitor logs and database state, and retain a tested rollback path. Remove V1 secrets only after all callers are migrated and verified.

## Remaining blockers

- The public BLMPay developer page still documents V1 at the time of this audit: https://pay.blmtec.co.tz/developer/docs.
- Need the authoritative V2 payout contract and a safe way to validate V2 payment/status responses.
- Need to reconcile deployed Edge Function source with the GitHub repository before deployment.
- Need V2 credentials configured as Supabase secrets before backend testing.
- The helper scaffold needs tests and provider validation before it is wired into any payment function.

## Immediate security cleanup

Remove the log statement that prints the first eight characters of the BLMPay key from `create-blmpay-payment` during the controlled code migration. Do not rotate or overwrite live credentials until replacement V2 secrets are configured and tested.
