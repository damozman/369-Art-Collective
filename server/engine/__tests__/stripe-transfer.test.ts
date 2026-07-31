/**
 * The Stripe transfer executor, against a fixture Stripe.
 *
 * The properties being proved here are the ones that decide whether a real
 * payout run is safe: an idempotency key that actually collapses a retry, a
 * failure that fails one contributor rather than aborting a batch, and a
 * default that refuses to move money rather than pretending it did.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  FixtureStripeClient,
  LiveStripeClient,
  normalizeStripeError,
  StripeTransferError,
  type StripeSdkLike,
} from "../adapters/stripe/client";
import {
  getTransferExecutor,
  setTransferExecutor,
} from "../adapters/stripe/factory";
import { StripeTransferExecutor } from "../adapters/stripe/transfer-executor";
import { UnconfiguredTransferExecutor, type TransferRequest } from "../payout";

function request(overrides: Partial<TransferRequest> = {}): TransferRequest {
  return {
    contributorId: "contributor-1",
    destinationAccountId: "acct_contributor",
    amountMinor: 12345n,
    currency: "USD",
    idempotencyKey: "payout_abc123",
    description: "Payout $123.45 to Maya Chen",
    metadata: { tenantId: "tenant-1", payoutId: "abc123" },
    ...overrides,
  };
}

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(vars)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

// ============================================================
// The happy path
// ============================================================

test("a successful transfer returns the provider's id", async () => {
  const client = new FixtureStripeClient();
  const executor = new StripeTransferExecutor({ client });

  const result = await executor.execute(request());

  assert.equal(result.status, "succeeded");
  assert.ok(result.transferId?.startsWith("tr_fixture_"));
  assert.equal(client.transfers.length, 1);
  assert.equal(client.transfers[0].amount, 12345);
  assert.equal(client.transfers[0].currency, "usd");
});

test("the transfer is instructed against the tenant's own connected account", async () => {
  // Ratified decision #1: we never hold the funds. The money leaves the
  // tenant's Stripe balance, not ours.
  const seen: Array<Record<string, unknown>> = [];
  const sdk: StripeSdkLike = {
    transfers: {
      async create(params, options) {
        seen.push({ params, options });
        return {
          id: "tr_live_1",
          amount: Number(params.amount),
          currency: String(params.currency),
          destination: params.destination,
          created: 0,
        };
      },
    },
    accounts: {
      async retrieve(id) {
        return { id };
      },
    },
  };

  const executor = new StripeTransferExecutor({
    client: new LiveStripeClient(sdk),
    onBehalfOfAccount: "acct_tenant",
  });

  await executor.execute(request());

  const options = seen[0].options as Record<string, unknown>;
  assert.equal(options.stripeAccount, "acct_tenant");
  assert.equal(options.idempotencyKey, "payout_abc123");
});

test("metadata is coerced to strings, as Stripe requires", async () => {
  const seen: Array<Record<string, unknown>> = [];
  const sdk: StripeSdkLike = {
    transfers: {
      async create(params) {
        seen.push(params);
        return { id: "tr_1", amount: 1, currency: "usd", destination: "acct", created: 0 };
      },
    },
    accounts: { async retrieve(id) { return { id }; } },
  };

  await new StripeTransferExecutor({ client: new LiveStripeClient(sdk) }).execute(
    request({ metadata: { count: 3 as unknown as string } })
  );

  assert.deepEqual(seen[0].metadata, { count: "3" });
});

// ============================================================
// Idempotency
// ============================================================

test("retrying with the same key returns the same transfer, not a second one", async () => {
  // This is the property the whole retry path rests on. A fixture that minted a
  // fresh id each time would make a broken retry path look correct.
  const client = new FixtureStripeClient();
  const executor = new StripeTransferExecutor({ client });

  const first = await executor.execute(request());
  const second = await executor.execute(request());

  assert.equal(first.transferId, second.transferId);
  assert.equal(client.transfers.length, 1, "only one transfer must exist");
});

test("different payouts get different transfer ids", async () => {
  const client = new FixtureStripeClient();
  const executor = new StripeTransferExecutor({ client });

  const a = await executor.execute(request({ idempotencyKey: "payout_a" }));
  const b = await executor.execute(request({ idempotencyKey: "payout_b" }));

  assert.notEqual(a.transferId, b.transferId);
  assert.equal(client.transfers.length, 2);
});

test("two executor instances cannot mint the same id for different payouts", async () => {
  // engine_payouts_stripe_transfer_unique would correctly reject a collision,
  // which would abort a batch mid-run.
  const one = new StripeTransferExecutor({ client: new FixtureStripeClient() });
  const two = new StripeTransferExecutor({ client: new FixtureStripeClient() });

  const a = await one.execute(request({ idempotencyKey: "payout_a" }));
  const b = await two.execute(request({ idempotencyKey: "payout_b" }));

  assert.notEqual(a.transferId, b.transferId);
});

// ============================================================
// Failures
// ============================================================

test("a Stripe failure becomes a result, never a thrown error", async () => {
  // runPayoutBatch reads results. A thrown error would abort the whole batch
  // and leave it stuck in `processing`.
  const client = new FixtureStripeClient({
    failFor: new Map([
      [
        "acct_frozen",
        new StripeTransferError("Account is restricted", "account_invalid", false),
      ],
    ]),
  });

  const result = await new StripeTransferExecutor({ client }).execute(
    request({ destinationAccountId: "acct_frozen" })
  );

  assert.equal(result.status, "failed");
  assert.equal(result.transferId, undefined);
});

test("failure reasons are written for a business owner, not a developer", async () => {
  const cases: Array<[string, string]> = [
    ["account_invalid", "reconnect"],
    ["balance_insufficient", "Not enough funds"],
    ["transfers_not_allowed", "Connect settings"],
    ["account_closed", "closed"],
  ];

  for (const [code, expected] of cases) {
    const client = new FixtureStripeClient({
      failFor: new Map([["acct_x", new StripeTransferError("raw stripe text", code, false)]]),
    });
    const result = await new StripeTransferExecutor({ client }).execute(
      request({ destinationAccountId: "acct_x" })
    );
    assert.ok(
      result.failureReason?.includes(expected),
      `${code} should mention "${expected}", got: ${result.failureReason}`
    );
  }
});

test("a retryable failure says so, so an owner knows to try again", async () => {
  const client = new FixtureStripeClient({
    failFor: new Map([
      ["acct_x", new StripeTransferError("connection reset", "api_connection_error", true)],
    ]),
  });
  const result = await new StripeTransferExecutor({ client }).execute(
    request({ destinationAccountId: "acct_x" })
  );
  assert.match(result.failureReason ?? "", /retry/i);
});

test("a non-positive amount is refused before it reaches Stripe", async () => {
  const client = new FixtureStripeClient();
  for (const amountMinor of [0n, -100n]) {
    const result = await new StripeTransferExecutor({ client }).execute(
      request({ amountMinor })
    );
    assert.equal(result.status, "failed");
  }
  assert.equal(client.transfers.length, 0);
});

test("an amount too large to survive Number is refused, not rounded", async () => {
  // Rounding here would send a wrong amount to a real bank account.
  const client = new FixtureStripeClient();
  const result = await new StripeTransferExecutor({ client }).execute(
    request({ amountMinor: BigInt(Number.MAX_SAFE_INTEGER) + 1n })
  );

  assert.equal(result.status, "failed");
  assert.match(result.failureReason ?? "", /precision/);
  assert.equal(client.transfers.length, 0);
});

test("an unexpected non-Stripe error still becomes a failed result", async () => {
  const executor = new StripeTransferExecutor({
    client: {
      async createTransfer() {
        throw new TypeError("something unexpected");
      },
      async getAccountStatus() {
        throw new Error("unused");
      },
    },
  });

  const result = await executor.execute(request());
  assert.equal(result.status, "failed");
  assert.match(result.failureReason ?? "", /something unexpected/);
});

// ============================================================
// Error classification
// ============================================================

test("transient Stripe errors are classified retryable and permanent ones are not", () => {
  assert.equal(normalizeStripeError({ code: "api_connection_error" }).retryable, true);
  assert.equal(normalizeStripeError({ code: "rate_limit" }).retryable, true);
  assert.equal(normalizeStripeError({ statusCode: 503 }).retryable, true);
  assert.equal(normalizeStripeError({ statusCode: 429 }).retryable, true);

  assert.equal(normalizeStripeError({ code: "account_invalid" }).retryable, false);
  assert.equal(normalizeStripeError({ code: "balance_insufficient" }).retryable, false);
  assert.equal(normalizeStripeError({ statusCode: 400 }).retryable, false);
});

test("an unrecognised error is treated as permanent", () => {
  // Safer default: a payout that stops with a reason is fixable, one that
  // retries a permanent failure forever looks like it is working.
  assert.equal(normalizeStripeError({ code: "something_new" }).retryable, false);
  assert.equal(normalizeStripeError(new Error("plain")).retryable, false);
});

// ============================================================
// The factory
// ============================================================

test("with no Stripe key and no opt-in, the executor refuses to move money", async () => {
  const executor = await withEnv(
    { STRIPE_SECRET_KEY: undefined, ALLOW_FIXTURE_TRANSFERS: undefined },
    () => getTransferExecutor()
  );

  assert.ok(executor instanceof UnconfiguredTransferExecutor);
  const result = await executor.execute(request());
  assert.equal(result.status, "failed");
  assert.match(result.failureReason ?? "", /No transfer provider configured/);
});

test("the fixture executor is opt-in, never a silent fallback", async () => {
  // A fixture returns success and debits the ledger — a contributor's balance
  // goes to zero having received nothing. Strictly worse than a failed run.
  const refusing = await withEnv(
    { STRIPE_SECRET_KEY: undefined, ALLOW_FIXTURE_TRANSFERS: "false" },
    () => getTransferExecutor()
  );
  assert.ok(refusing instanceof UnconfiguredTransferExecutor);

  const optedIn = await withEnv(
    { STRIPE_SECRET_KEY: undefined, ALLOW_FIXTURE_TRANSFERS: "true" },
    () => getTransferExecutor()
  );
  assert.ok(optedIn instanceof StripeTransferExecutor);
  assert.equal((await optedIn.execute(request())).status, "succeeded");
});

test("an installed override wins over the environment", async () => {
  const stub = { async execute() { return { status: "succeeded" as const, transferId: "tr_stub" }; } };
  setTransferExecutor(stub);
  try {
    const executor = await withEnv({ STRIPE_SECRET_KEY: undefined }, () =>
      getTransferExecutor()
    );
    assert.equal(executor, stub);
  } finally {
    setTransferExecutor(null);
  }
});

test("the executor is not cached across calls, so tenants cannot share one", async () => {
  // A process-wide singleton would send one tenant's payouts out of another
  // tenant's Stripe balance.
  await withEnv(
    { STRIPE_SECRET_KEY: undefined, ALLOW_FIXTURE_TRANSFERS: "true" },
    async () => {
      const a = await getTransferExecutor({ tenantStripeAccountId: "acct_a" });
      const b = await getTransferExecutor({ tenantStripeAccountId: "acct_b" });
      assert.notEqual(a, b);
    }
  );
});

// ============================================================
// Account status
// ============================================================

test("account status reports what Stripe is still waiting on", async () => {
  const sdk: StripeSdkLike = {
    transfers: {
      async create() {
        throw new Error("unused");
      },
    },
    accounts: {
      async retrieve(id) {
        return {
          id,
          payouts_enabled: false,
          charges_enabled: true,
          details_submitted: true,
          requirements: {
            currently_due: ["individual.id_number"],
            disabled_reason: "requirements.past_due",
          },
        };
      },
    },
  };

  const status = await new LiveStripeClient(sdk).getAccountStatus("acct_pending");

  assert.equal(status.payoutsEnabled, false);
  assert.deepEqual(status.currentlyDue, ["individual.id_number"]);
  assert.equal(status.disabledReason, "requirements.past_due");
});
