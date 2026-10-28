# BLMPay API V2 Migration Audit — I|ONE

**Status:** preparation only; no production functions changed and no payment/payout was sent.  
**Target:** complete migration before BLMPay V1 sunset: **15 November 2026, 23:59 EAT**.  
**Repository branch:** `audit/blmpay-v2-migration`.

## Safety decision

Do not edit or deploy production payment functions as a bulk replacement. The currently deployed Supabase Edge Functions contain several independent payment, reconciliation, and payout flows. The repository's checked-in function paths do not fully match the currently deployed functions, so deployment from repository source without reconciling that drift could overwrite working production behavior.

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

Functions such as `ione-chapchap-seller` and `ione-chapchap-buyer` were not identified as direct BLMPay API callers in the inspected source; keep them out of the migration unless a further trace proves otherwise.

## V2 request-signing contract provided from the BLMPay dashboard

For `POST /api/v2/payments`, sign the exact request-body bytes that will be sent:

```ts
const timestamp = String(Math.floor(Date.now() / 1000));
const nonce = hex(crypto.getRandomValues(new Uint8Array(16)));
const target = "/api/v2/payments";
const canonical = `POST\\n${target}\\n${timestamp}\\n${nonce}\\n${await sha256Hex(body)}`;
const signature = await hmacSha256Hex(secret, canonical);
```

Required headers include `Authorization: BLMPay-HMAC <API_KEY>`, `X-BLMPay-Timestamp`, `X-BLMPay-Nonce`, `X-BLMPay-Signature`, `X-BLMPay-Origin: https://intoione.space`, `Content-Type: application/json`, and a stable `Idempotency-Key`.

Implementation requirements:
- Keep API key and HMAC secret in Supabase Edge Function secrets only; never in the website bundle or repository.
- Sign the exact serialized body string used as `fetch(..., { body })`; do not serialize a second time after signing.
- Generate a fresh nonce per request and use a Unix timestamp in seconds.
- Keep the same idempotency key only for retries of the same payment attempt with the same body; do not reuse it across different orders.
- Preserve existing payment types, amounts, customer fields, metadata, webhook URLs, order references, and response fields consumed by the frontend.
- Never log API keys, HMAC secrets, signatures, phone numbers, or raw payment payloads containing personal data.
- Add bounded timeouts and safe provider error handling without converting uncertain responses into “paid”.

## Status and payout migration must be separate

The dashboard information available for this audit confirms the V2 payment list and single-payment status paths, but the full V2 response schema and terminal status enum have not been verified. Do not change status parsing until the actual V2 response has been checked against a sandbox/test transaction.

The existing payout flows use V1 fee quote, recipient lookup, send, and payout-status routes. The user-provided V2 material does not yet establish the corresponding payout paths, HMAC canonical targets, payloads, or response shapes. Do not invent V2 payout routes and do not send live payouts as a test. Obtain the official V2 payout contract before changing these flows.

## Webhook safety

Outgoing V2 request authentication and incoming webhook authentication are separate mechanisms. Preserve the existing webhook signature validation until BLMPay confirms the V2 webhook signing contract. Continue to treat verified webhooks as an event source and status queries as reconciliation, with idempotent database state transitions.

## Staged rollout plan

1. **Credential readiness:** add the V2 API key and HMAC secret as server-side Supabase secrets. Keep V1 credentials available for rollback during the transition. Confirm the registered origin is `https://intoione.space`.
2. **Shared signing helper:** implement and unit-test SHA-256 body hashing, HMAC-SHA256 signing, timestamp/nonce generation, origin header, idempotency validation, and safe error handling in a branch.
3. **Payments only first:** migrate one payment-creation path at a time; keep existing request body and frontend response contract stable. Use provider sandbox/test mode if BLMPay supplies it; otherwise use a non-financial, explicitly supported validation method.
4. **Read/status flows:** verify actual V2 response fields and status enum before changing reconciliation. Test pending, completed, failed, expired/cancelled, malformed response, timeout, and retry scenarios.
5. **Payouts:** wait for official V2 payout fee/name-lookup/send/status specs. Then migrate each payout workflow independently and verify idempotency and ledger rollback behavior without initiating a real transfer.
6. **Webhooks:** preserve existing signature verification unless the official V2 webhook spec explicitly changes it. Test duplicate delivery and fallback reconciliation.
7. **Release:** review diffs, deploy one Edge Function at a time, run a low-risk end-to-end test, monitor logs and database state, and retain a tested rollback path. Do not remove V1 secrets until all callers are migrated and verified.

## Remaining blockers

- Confirmed V2 payment creation details are available from the dashboard material supplied by the owner.
- The public BLMPay developer page currently still documents V1, so it cannot verify the newer V2 contract.
- Need the authoritative V2 payout contract and a way to validate V2 responses safely.
- Need to reconcile deployed Edge Function source with the GitHub repository before deploying from the repository.
- Need V2 credentials configured as Supabase secrets before a real backend test can be performed.

## Immediate security cleanup

Remove the existing log statement that prints the first eight characters of the BLMPay key from `create-blmpay-payment` during the controlled code migration. Do not rotate or overwrite live credentials until the replacement V2 secrets are configured and tested.
