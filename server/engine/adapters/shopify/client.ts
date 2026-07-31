/**
 * The Shopify Admin API seam.
 *
 * Same reasoning as `CostResolver` and `TransferExecutor`: cloud sandboxes are
 * network-allowlisted and cannot reach `*.myshopify.com`, so any logic that can
 * only run with live credentials is logic that never gets exercised until it is
 * exercised on someone's real money. Everything above this interface is tested
 * against `FixtureShopifyClient`; only the transport below it needs a real
 * store, and the transport is the part with no decisions in it.
 *
 * WHY WE CALL THE API AT ALL, GIVEN WEBHOOKS PUSH. Two reasons, both about
 * fees. The order webhook does not include the payment processing fee — it is
 * on the order's transactions — and the fee is not final at `orders/create`
 * either. Fetching is the only way to get an actual number rather than an
 * assumed one, which money decision 4 in `map.ts` refuses to do.
 */

import type { ShopifyOrder, ShopifyTransaction } from "./types";

export interface ShopifyShopInfo {
  id: number;
  name: string;
  myshopify_domain: string;
  domain?: string;
  currency: string;
  /** IANA timezone, e.g. `America/Chicago`. */
  iana_timezone?: string;
}

export interface ShopifyWebhookSubscription {
  id: number;
  topic: string;
  address: string;
  api_version?: string;
}

export interface ShopifyAdminClient {
  getShop(): Promise<ShopifyShopInfo>;
  getOrder(orderId: number | string): Promise<ShopifyOrder>;
  getOrderTransactions(orderId: number | string): Promise<ShopifyTransaction[]>;
  listWebhooks(): Promise<ShopifyWebhookSubscription[]>;
  createWebhook(topic: string, address: string): Promise<ShopifyWebhookSubscription>;
  deleteWebhook(id: number): Promise<void>;
}

export class ShopifyApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: string
  ) {
    super(message);
    this.name = "ShopifyApiError";
  }

  /** True when the credential is the problem, so the connection should be marked. */
  get isAuthFailure(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

/**
 * Pinned deliberately. Shopify deprecates API versions on a rolling quarterly
 * schedule, and "latest" would silently change payload shapes underneath the
 * mapper — which reads specific fields and would start seeing `undefined`
 * where a price used to be. Bumping this is a code change with a test run.
 */
export const SHOPIFY_API_VERSION = "2025-01";

// ============================================================
// Live
// ============================================================

export interface LiveShopifyClientOptions {
  shopDomain: string;
  accessToken: string;
  apiVersion?: string;
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Retries on 429 and 5xx. Shopify's bucket refills, so waiting works. */
  maxRetries?: number;
  /** Injected so a test does not actually sleep. */
  sleep?: (ms: number) => Promise<void>;
}

export class LiveShopifyClient implements ShopifyAdminClient {
  private readonly shopDomain: string;
  private readonly accessToken: string;
  private readonly apiVersion: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: LiveShopifyClientOptions) {
    this.shopDomain = options.shopDomain;
    this.accessToken = options.accessToken;
    this.apiVersion = options.apiVersion ?? SHOPIFY_API_VERSION;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.maxRetries = options.maxRetries ?? 3;
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private url(path: string): string {
    return `https://${this.shopDomain}/admin/api/${this.apiVersion}/${path}`;
  }

  private async request<T>(
    path: string,
    init: RequestInit = {}
  ): Promise<T> {
    let lastError: ShopifyApiError | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const response = await this.fetchImpl(this.url(path), {
        ...init,
        headers: {
          "X-Shopify-Access-Token": this.accessToken,
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(init.headers ?? {}),
        },
      });

      if (response.ok) {
        if (response.status === 204) return undefined as T;
        return (await response.json()) as T;
      }

      const body = await response.text().catch(() => "");

      // 429 is Shopify's leaky bucket, not a failure. 5xx is usually transient.
      const retryable = response.status === 429 || response.status >= 500;

      lastError = new ShopifyApiError(
        `Shopify ${init.method ?? "GET"} ${path} failed with ${response.status}`,
        response.status,
        // Truncated: an error body can contain a full order payload, and this
        // ends up in logs.
        body.slice(0, 500)
      );

      if (!retryable || attempt === this.maxRetries) break;

      const retryAfter = Number(response.headers.get("retry-after") ?? "0");
      const delayMs = retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt;
      await this.sleep(delayMs);
    }

    throw lastError ?? new ShopifyApiError(`Shopify ${path} failed`, 0);
  }

  async getShop(): Promise<ShopifyShopInfo> {
    const data = await this.request<{ shop: ShopifyShopInfo }>("shop.json");
    return data.shop;
  }

  async getOrder(orderId: number | string): Promise<ShopifyOrder> {
    const data = await this.request<{ order: ShopifyOrder }>(`orders/${orderId}.json`);
    return data.order;
  }

  async getOrderTransactions(orderId: number | string): Promise<ShopifyTransaction[]> {
    const data = await this.request<{ transactions: ShopifyTransaction[] }>(
      `orders/${orderId}/transactions.json`
    );
    return data.transactions ?? [];
  }

  async listWebhooks(): Promise<ShopifyWebhookSubscription[]> {
    const data = await this.request<{ webhooks: ShopifyWebhookSubscription[] }>(
      "webhooks.json"
    );
    return data.webhooks ?? [];
  }

  async createWebhook(topic: string, address: string): Promise<ShopifyWebhookSubscription> {
    const data = await this.request<{ webhook: ShopifyWebhookSubscription }>("webhooks.json", {
      method: "POST",
      body: JSON.stringify({ webhook: { topic, address, format: "json" } }),
    });
    return data.webhook;
  }

  async deleteWebhook(id: number): Promise<void> {
    await this.request<void>(`webhooks/${id}.json`, { method: "DELETE" });
  }
}

// ============================================================
// Fixture
// ============================================================

/**
 * An in-memory Shopify. Everything above the seam is tested against this.
 *
 * `failFor` reproduces the failures that actually matter — an order whose
 * transactions cannot be read is the case `feePolicy: "actual"` exists to
 * handle, and it needs to be reachable in a test without breaking a real store.
 */
export class FixtureShopifyClient implements ShopifyAdminClient {
  readonly calls: Array<{ method: string; arg?: unknown }> = [];

  private webhooks: ShopifyWebhookSubscription[] = [];
  private nextWebhookId = 1;

  constructor(
    private readonly data: {
      shop?: ShopifyShopInfo;
      orders?: Map<string, ShopifyOrder>;
      transactions?: Map<string, ShopifyTransaction[]>;
      /** Order ids whose transaction fetch should throw. */
      failTransactionsFor?: Set<string>;
    } = {}
  ) {}

  async getShop(): Promise<ShopifyShopInfo> {
    this.calls.push({ method: "getShop" });
    return (
      this.data.shop ?? {
        id: 1,
        name: "Fixture Store",
        myshopify_domain: "fixture-store.myshopify.com",
        currency: "USD",
      }
    );
  }

  async getOrder(orderId: number | string): Promise<ShopifyOrder> {
    this.calls.push({ method: "getOrder", arg: orderId });
    const order = this.data.orders?.get(String(orderId));
    if (!order) {
      throw new ShopifyApiError(`Fixture has no order ${orderId}`, 404);
    }
    return order;
  }

  async getOrderTransactions(orderId: number | string): Promise<ShopifyTransaction[]> {
    this.calls.push({ method: "getOrderTransactions", arg: orderId });
    if (this.data.failTransactionsFor?.has(String(orderId))) {
      throw new ShopifyApiError(`Fixture: transactions unavailable for ${orderId}`, 500);
    }
    return this.data.transactions?.get(String(orderId)) ?? [];
  }

  async listWebhooks(): Promise<ShopifyWebhookSubscription[]> {
    this.calls.push({ method: "listWebhooks" });
    return [...this.webhooks];
  }

  async createWebhook(topic: string, address: string): Promise<ShopifyWebhookSubscription> {
    this.calls.push({ method: "createWebhook", arg: { topic, address } });
    const webhook = {
      id: this.nextWebhookId++,
      topic,
      address,
      api_version: SHOPIFY_API_VERSION,
    };
    this.webhooks.push(webhook);
    return webhook;
  }

  async deleteWebhook(id: number): Promise<void> {
    this.calls.push({ method: "deleteWebhook", arg: id });
    this.webhooks = this.webhooks.filter((w) => w.id !== id);
  }
}

// ============================================================
// Webhook registration
// ============================================================

/** The topics the engine needs. Anything else is noise we would only ignore. */
export const REQUIRED_WEBHOOK_TOPICS = [
  // Revenue is recognised on payment, not on cart submission — an unpaid order
  // that never completes would otherwise sit in the ledger as earnings.
  "orders/paid",
  "orders/cancelled",
  "refunds/create",
  // Without this, an uninstalled app keeps a dead connection marked active and
  // the owner sees "connected" next to a store that stopped sending anything.
  "app/uninstalled",
] as const;

export interface WebhookSyncResult {
  created: string[];
  alreadyPresent: string[];
  removed: number[];
}

/**
 * Make the store's webhook subscriptions match what the engine needs.
 *
 * Idempotent: re-running it is how a reconnect repairs a partially-registered
 * store. Stale subscriptions pointing at *our* address for topics we no longer
 * handle are removed; subscriptions pointing anywhere else are left alone,
 * because a merchant's other apps are not ours to tidy.
 */
export async function syncWebhooks(
  client: ShopifyAdminClient,
  address: string
): Promise<WebhookSyncResult> {
  const existing = await client.listWebhooks();

  const ours = existing.filter((w) => w.address === address);
  const byTopic = new Map(ours.map((w) => [w.topic, w]));

  const created: string[] = [];
  const alreadyPresent: string[] = [];

  for (const topic of REQUIRED_WEBHOOK_TOPICS) {
    if (byTopic.has(topic)) {
      alreadyPresent.push(topic);
      continue;
    }
    await client.createWebhook(topic, address);
    created.push(topic);
  }

  const required = new Set<string>(REQUIRED_WEBHOOK_TOPICS);
  const removed: number[] = [];
  for (const webhook of ours) {
    if (!required.has(webhook.topic)) {
      await client.deleteWebhook(webhook.id);
      removed.push(webhook.id);
    }
  }

  return { created, alreadyPresent, removed };
}
