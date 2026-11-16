import {
  blmpayV2Url,
  createBlmpayV2Headers,
  validateBlmpayV2Target,
} from "./blmpay-v2.ts";

Deno.test("BLMPay V2 URL stays on the official host and V2 namespace", () => {
  if (blmpayV2Url("/api/v2/payments") !== "https://pay.blmtec.co.tz/api/v2/payments") {
    throw new Error("Unexpected BLMPay V2 URL.");
  }
  for (const target of [
    "https://evil.example/api/v2/payments",
    "//evil.example/api/v2/payments",
    "/api/v1/payments",
    "/api/v2/payments#fragment",
    "/api/v2/payments with-space",
    "/api/v2\\payments",
  ]) {
    let rejected = false;
    try {
      validateBlmpayV2Target(target);
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error(`Expected target to be rejected: ${target}`);
  }
});

Deno.test("BLMPay V2 signer emits required headers and a verifiable HMAC", async () => {
  Deno.env.set("BLMPAY_V2_API_KEY", "test-api-key");
  Deno.env.set("BLMPAY_V2_HMAC_SECRET", "test-hmac-secret");
  try {
    const body = '{"amount":1000,"currency":"TZS"}';
    const target = "/api/v2/payments";
    const headers = await createBlmpayV2Headers({
      method: "POST",
      target,
      body,
      idempotencyKey: "test-order-001",
      origin: "https://intoione.space",
    });

    if (headers.get("Authorization") !== "BLMPay-HMAC test-api-key") {
      throw new Error("Missing HMAC Authorization header.");
    }
    if (headers.get("X-BLMPay-Origin") !== "https://intoione.space") {
      throw new Error("Incorrect origin header.");
    }
    if (headers.get("Content-Type") !== "application/json") {
      throw new Error("Missing JSON content type.");
    }
    if (headers.get("Idempotency-Key") !== "test-order-001") {
      throw new Error("Missing idempotency key.");
    }

    const timestamp = headers.get("X-BLMPay-Timestamp");
    const nonce = headers.get("X-BLMPay-Nonce");
    const signature = headers.get("X-BLMPay-Signature");
    if (!timestamp || !/^\d+$/.test(timestamp)) throw new Error("Invalid timestamp.");
    if (!nonce || !/^[a-f0-9]{32}$/.test(nonce)) throw new Error("Invalid nonce.");
    if (!signature || !/^[a-f0-9]{64}$/.test(signature)) throw new Error("Invalid signature format.");

    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
    const bodyHash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
    const canonical = `POST\n${target}\n${timestamp}\n${nonce}\n${bodyHash}`;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode("test-hmac-secret"),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const expectedBytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(canonical));
    const expected = Array.from(new Uint8Array(expectedBytes), (b) => b.toString(16).padStart(2, "0")).join("");
    if (signature !== expected) throw new Error("Signature does not match canonical request.");
  } finally {
    Deno.env.delete("BLMPAY_V2_API_KEY");
    Deno.env.delete("BLMPAY_V2_HMAC_SECRET");
  }
});

Deno.test("BLMPay V2 signer rejects invalid idempotency keys and origins", async () => {
  Deno.env.set("BLMPAY_V2_API_KEY", "test-api-key");
  Deno.env.set("BLMPAY_V2_HMAC_SECRET", "test-hmac-secret");
  try {
    for (const args of [
      { idempotencyKey: "short" },
      { idempotencyKey: "bad key value" },
      { origin: "http://intoione.space" },
      { origin: "https://intoione.space/path" },
    ]) {
      let rejected = false;
      try {
        await createBlmpayV2Headers({
          method: "POST",
          target: "/api/v2/payments",
          body: "{}",
          ...args,
        });
      } catch {
        rejected = true;
      }
      if (!rejected) throw new Error("Expected invalid signer arguments to be rejected.");
    }
  } finally {
    Deno.env.delete("BLMPAY_V2_API_KEY");
    Deno.env.delete("BLMPAY_V2_HMAC_SECRET");
  }
});
