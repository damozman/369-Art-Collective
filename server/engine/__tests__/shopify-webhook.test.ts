/**
 * Webhook authentication and Admin API client behaviour.
 *
 * The signature check is the only thing standing between a public URL and
 * anyone being able to mint ledger entries, so it gets tested against genuinely
 * signed bodies rather than against a stubbed verifier.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  FixtureShopifyClient,
  LiveShopifyClient,
  REQUIRED_WEBHOOK_TOPICS,
  ShopifyApiError,
  syncWebhooks,
} from "../adapters/shopify/client";
import {
  normalizeShopDomain,
  readWebhookHeaders,
  signWebhookBody,
  verifyShopifyWebhook,
} from "../adapters/shopify/webhook-auth";
import { twoLineOrder } from "../adapters/shopify/__fixtures__/orders";

const SECRET = "shpss_test_webhook_secret";

// ============================================================
// Signatures
// ============================================================

test("a correctly signed body verifies", () => {
  const body = JSON.stringify(twoLineOrder);
  const signature = signWebhookBody(body, SECRET);
  assert.deepEqual(verifyShopifyWebhook(body, signature, SECRET), { ok: true });
});

test("a body signed with a different secret is rejected", () => {
  const body = JSON.stringify(twoLineOrder);
  const signature = signWebhookBody(body, "some-other-secret");
  const verdict = verifyShopifyWebhook(body, signature, SECRET);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.ok === false && verdict.status, 401);
});

test("a modified body no longer verifies", () => {
  // The whole point: an attacker cannot change the price and keep the signature.
  const body = JSON.stringify(twoLineOrder);
  const signature = signWebhookBody(body, SECRET);
  const tampered = body.replace('"78.00"', '"7800.00"');
  assert.notEqual(tampered, body);
  assert.equal(verifyShopifyWebhook(tampered, signature, SECRET).ok, false);
});

test("re-serialising the body breaks the signature, which is why raw bytes are used", () => {
  // This test exists to document the trap. JSON.parse → JSON.stringify is not
  // byte-identical, so verifying against a re-serialised body fails for every
  // legitimate delivery — and the usual "fix" is to stop verifying.
  const body = '{"id":1,  "name":"#1042"}';
  const signature = signWebhookBody(body, SECRET);
  const reserialised = JSON.stringify(JSON.parse(body));
  assert.notEqual(reserialised, body);
  assert.equal(verifyShopifyWebhook(reserialised, signature, SECRET).ok, false);
  assert.equal(verifyShopifyWebhook(body, signature, SECRET).ok, true);
});

test("a missing signature header is rejected", () => {
  const verdict = verifyShopifyWebhook("{}", null, SECRET);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.ok === false && verdict.status, 401);
});

test("a missing secret is a rejection, never 'nothing to check against'", () => {
  const body = "{}";
  const verdict = verifyShopifyWebhook(body, signWebhookBody(body, SECRET), "");
  assert.equal(verdict.ok, false);
});

test("verification works on a Buffer body as well as a string", () => {
  const body = Buffer.from(JSON.stringify(twoLineOrder), "utf8");
  assert.equal(verifyShopifyWebhook(body, signWebhookBody(body, SECRET), SECRET).ok, true);
});

// ============================================================
// Headers and domains
// ============================================================

test("Shopify's headers are read case-insensitively as Express lowercases them", () => {
  const headers = readWebhookHeaders({
    "x-shopify-hmac-sha256": "sig",
    "x-shopify-topic": "orders/paid",
    "x-shopify-shop-domain": "store.myshopify.com",
    "x-shopify-webhook-id": "abc",
  });

  assert.equal(headers.hmac, "sig");
  assert.equal(headers.topic, "orders/paid");
  assert.equal(headers.shopDomain, "store.myshopify.com");
  assert.equal(headers.apiVersion, null);
});

test("shop domains normalize to one lookup key", () => {
  // A lookup miss on an inbound webhook is silently dropped revenue, so all the
  // ways an owner might type it have to land on the same row.
  for (const input of [
    "store.myshopify.com",
    "Store.MyShopify.com",
    "https://store.myshopify.com",
    "https://store.myshopify.com/admin",
    " store.myshopify.com ",
    "store",
  ]) {
    assert.equal(normalizeShopDomain(input), "store.myshopify.com", input);
  }
});

// ============================================================
// Admin client
// ============================================================

test("the live client sends the access token and pins the API version", async () => {
  const seen: Array<{ url: string; headers: Record<string, string> }> = [];

  const client = new LiveShopifyClient({
    shopDomain: "store.myshopify.com",
    accessToken: "shpat_token",
    fetchImpl: (async (url: string, init: RequestInit) => {
      seen.push({ url, headers: init.headers as Record<string, string> });
      return new Response(JSON.stringify({ order: twoLineOrder }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch,
  });

  await client.getOrder(twoLineOrder.id);

  assert.match(seen[0].url, /^https:\/\/store\.myshopify\.com\/admin\/api\/\d{4}-\d{2}\/orders\//);
  assert.equal(seen[0].headers["X-Shopify-Access-Token"], "shpat_token");
});

test("a 429 is retried and then succeeds", async () => {
  // Shopify's leaky bucket is not a failure, and treating it as one loses fees.
  let calls = 0;
  const slept: number[] = [];

  const client = new LiveShopifyClient({
    shopDomain: "store.myshopify.com",
    accessToken: "shpat_token",
    sleep: async (ms) => {
      slept.push(ms);
    },
    fetchImpl: (async () => {
      calls += 1;
      if (calls === 1) {
        return new Response("rate limited", {
          status: 429,
          headers: { "retry-after": "2" },
        });
      }
      return new Response(JSON.stringify({ transactions: [] }), { status: 200 });
    }) as unknown as typeof fetch,
  });

  const transactions = await client.getOrderTransactions(1);
  assert.deepEqual(transactions, []);
  assert.equal(calls, 2);
  assert.deepEqual(slept, [2000]);
});

test("a 401 is not retried and is flagged as an auth failure", async () => {
  let calls = 0;
  const client = new LiveShopifyClient({
    shopDomain: "store.myshopify.com",
    accessToken: "revoked",
    sleep: async () => {},
    fetchImpl: (async () => {
      calls += 1;
      return new Response("unauthorized", { status: 401 });
    }) as unknown as typeof fetch,
  });

  await assert.rejects(
    () => client.getShop(),
    (error: unknown) => {
      assert.ok(error instanceof ShopifyApiError);
      assert.equal(error.isAuthFailure, true);
      return true;
    }
  );
  assert.equal(calls, 1, "an auth failure must not be retried");
});

test("an error body is truncated so a full order payload does not reach the logs", async () => {
  const client = new LiveShopifyClient({
    shopDomain: "store.myshopify.com",
    accessToken: "t",
    maxRetries: 0,
    sleep: async () => {},
    fetchImpl: (async () =>
      new Response("x".repeat(5000), { status: 422 })) as unknown as typeof fetch,
  });

  await assert.rejects(
    () => client.getShop(),
    (error: unknown) => {
      assert.ok(error instanceof ShopifyApiError);
      assert.ok((error.body?.length ?? 0) <= 500);
      return true;
    }
  );
});

// ============================================================
// Webhook registration
// ============================================================

test("syncing registers every topic the engine needs", async () => {
  const client = new FixtureShopifyClient();
  const result = await syncWebhooks(client, "https://app.example.com/api/engine/webhooks/shopify");

  assert.deepEqual(result.created, [...REQUIRED_WEBHOOK_TOPICS]);
  assert.deepEqual(result.alreadyPresent, []);
  assert.equal((await client.listWebhooks()).length, REQUIRED_WEBHOOK_TOPICS.length);
});

test("syncing twice is a no-op — a reconnect repairs rather than duplicates", async () => {
  const client = new FixtureShopifyClient();
  const address = "https://app.example.com/api/engine/webhooks/shopify";

  await syncWebhooks(client, address);
  const second = await syncWebhooks(client, address);

  assert.deepEqual(second.created, []);
  assert.deepEqual(second.alreadyPresent, [...REQUIRED_WEBHOOK_TOPICS]);
});

test("a stale subscription of ours is removed, and another app's is left alone", async () => {
  const client = new FixtureShopifyClient();
  const ours = "https://app.example.com/api/engine/webhooks/shopify";
  const theirs = "https://someone-else.example.com/hook";

  await client.createWebhook("orders/fulfilled", ours);
  await client.createWebhook("orders/fulfilled", theirs);

  const result = await syncWebhooks(client, ours);

  assert.equal(result.removed.length, 1);
  const remaining = await client.listWebhooks();
  assert.ok(remaining.some((w) => w.address === theirs && w.topic === "orders/fulfilled"));
  assert.ok(!remaining.some((w) => w.address === ours && w.topic === "orders/fulfilled"));
});

test("orders/create is deliberately not subscribed to", () => {
  // Revenue is recognised on payment. An unpaid order that never completes
  // would otherwise sit in the ledger as somebody's earnings.
  assert.ok(!REQUIRED_WEBHOOK_TOPICS.includes("orders/create" as never));
  assert.ok(REQUIRED_WEBHOOK_TOPICS.includes("orders/paid"));
});

test("the fixture client can be made to fail a transactions fetch", async () => {
  const client = new FixtureShopifyClient({
    failTransactionsFor: new Set(["5001000001"]),
  });
  await assert.rejects(() => client.getOrderTransactions(5001000001), ShopifyApiError);
});
