/**
 * The narrow Stripe surface the engine needs, behind a seam.
 *
 * WHY NOT JUST IMPORT THE STRIPE SDK. Two reasons, and only one of them is
 * testability.
 *
 * The first is that a sandbox cannot reach `api.stripe.com`, so code written
 * directly against the SDK is code that runs for the first time against a real
 * account and real money. The whole payout state machine — partial batches,
 * retries after ambiguous failures, idempotent replays — is exercised through
 * `FixtureStripeClient` instead, before any of it touches a bank.
 *
 * The second is scope. Stripe's SDK surface is enormous and the engine needs
 * four calls. Naming those four makes the blast radius of "we use Stripe"
 * legible, and makes it obvious when something starts reaching for a fifth.
 *
 * NOTE WHAT IS ABSENT: nothing here creates a charge, holds a balance, or moves
 * money into an account we control. Ratified decision #1 is that we never hold
 * funds — the tenant connects their own Stripe and we instruct transfers out of
 * it. A `charges.create` in this file would be the moment this became money
 * transmission.
 */

export interface StripeTransferParams {
  amount: number;
  currency: string;
  destination: string;
  description?: string;
  metadata?: Record<string, string>;
  /**
   * Stripe collapses two requests with the same key into one result for 24
   * hours. This is what makes retrying an ambiguous failure safe rather than
   * a way to pay somebody twice.
   */
  idempotencyKey: string;
  /**
   * The connected account the transfer is made *from*. Ratified decision #1:
   * the funds are the tenant's, sitting in the tenant's own Stripe account, and
   * we act on their behalf via Stripe-Account rather than out of a balance of
   * our own.
   */
  onBehalfOfAccount?: string;
}

export interface StripeTransferResponse {
  id: string;
  amount: number;
  currency: string;
  destination: string;
  created: number;
}

export interface StripeAccountStatus {
  id: string;
  payoutsEnabled: boolean;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  /** Requirements Stripe is still waiting on, so the console can say what. */
  currentlyDue: string[];
  disabledReason: string | null;
}

export interface CreateConnectedAccountParams {
  /** Two-letter country. Stripe cannot change it later — see `payout-account.ts`. */
  country: string;
  email?: string;
  /** Shown in Stripe's own onboarding so the person knows who they are joining. */
  businessProfileName?: string;
  metadata?: Record<string, string>;
  /**
   * The tenant's Stripe account, under which the contributor's account is
   * created. Ratified decision #1: the contributor is the tenant's payee, not
   * ours, and the money never passes through an account we control.
   */
  onBehalfOfAccount?: string;
}

export interface CreateAccountLinkParams {
  accountId: string;
  /** Where Stripe sends the person when they finish or abandon the flow. */
  returnUrl: string;
  /** Where Stripe sends them when the link has expired. */
  refreshUrl: string;
  onBehalfOfAccount?: string;
}

export interface AccountLink {
  url: string;
  /** Unix seconds. Stripe expires these in minutes — see `payout-account.ts`. */
  expiresAt: number;
}

/**
 * A Stripe failure, normalized.
 *
 * `retryable` is the field that matters: a network blip should be retried and
 * an account with payouts disabled should not, and treating the second as the
 * first produces a payout that retries forever while the contributor waits.
 */
export class StripeTransferError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
    readonly retryable: boolean,
    readonly declineCode?: string | null
  ) {
    super(message);
    this.name = "StripeTransferError";
  }
}

export interface StripeClient {
  createTransfer(params: StripeTransferParams): Promise<StripeTransferResponse>;
  getAccountStatus(accountId: string, onBehalfOfAccount?: string): Promise<StripeAccountStatus>;
  createConnectedAccount(params: CreateConnectedAccountParams): Promise<{ id: string }>;
  createAccountLink(params: CreateAccountLinkParams): Promise<AccountLink>;
}

// ============================================================
// Live
// ============================================================

/**
 * Stripe error codes that a retry can actually fix.
 *
 * Everything absent is treated as permanent, which is the safer default: a
 * payout that stops and shows a reason is fixable by a human, whereas one that
 * retries a permanent failure looks like the system is working.
 */
const RETRYABLE_CODES = new Set([
  "api_connection_error",
  "api_error",
  "rate_limit",
  "lock_timeout",
  "processing_error",
]);

interface StripeLikeError {
  message?: string;
  code?: string;
  type?: string;
  decline_code?: string;
  statusCode?: number;
}

export function normalizeStripeError(error: unknown): StripeTransferError {
  const e = error as StripeLikeError;
  const code = e?.code ?? e?.type ?? null;

  const retryable =
    (code != null && RETRYABLE_CODES.has(code)) ||
    e?.statusCode === 429 ||
    (typeof e?.statusCode === "number" && e.statusCode >= 500);

  return new StripeTransferError(
    e?.message ?? "Stripe request failed",
    code,
    retryable,
    e?.decline_code ?? null
  );
}

/**
 * The shape of the Stripe SDK this adapter uses.
 *
 * Structural rather than a hard dependency on `Stripe`, so the SDK is not
 * loaded (or required to be installed and configured) merely to type-check this
 * file, and so a test can pass a plain object.
 */
export interface StripeSdkLike {
  transfers: {
    create(
      params: Record<string, unknown>,
      options?: Record<string, unknown>
    ): Promise<{
      id: string;
      amount: number;
      currency: string;
      destination: unknown;
      created: number;
    }>;
  };
  accounts: {
    retrieve(
      id: string,
      options?: Record<string, unknown>
    ): Promise<{
      id: string;
      payouts_enabled?: boolean;
      charges_enabled?: boolean;
      details_submitted?: boolean;
      requirements?: { currently_due?: string[] | null; disabled_reason?: string | null } | null;
    }>;
    create(
      params: Record<string, unknown>,
      options?: Record<string, unknown>
    ): Promise<{ id: string }>;
  };
  accountLinks: {
    create(
      params: Record<string, unknown>,
      options?: Record<string, unknown>
    ): Promise<{ url: string; expires_at: number }>;
  };
}

export class LiveStripeClient implements StripeClient {
  constructor(private readonly sdk: StripeSdkLike) {}

  async createTransfer(params: StripeTransferParams): Promise<StripeTransferResponse> {
    try {
      const transfer = await this.sdk.transfers.create(
        {
          amount: params.amount,
          currency: params.currency.toLowerCase(),
          destination: params.destination,
          description: params.description,
          metadata: params.metadata,
        },
        {
          idempotencyKey: params.idempotencyKey,
          ...(params.onBehalfOfAccount ? { stripeAccount: params.onBehalfOfAccount } : {}),
        }
      );

      return {
        id: transfer.id,
        amount: transfer.amount,
        currency: transfer.currency,
        destination:
          typeof transfer.destination === "string"
            ? transfer.destination
            : ((transfer.destination as { id?: string } | null)?.id ?? params.destination),
        created: transfer.created,
      };
    } catch (error) {
      throw normalizeStripeError(error);
    }
  }

  async createConnectedAccount(params: CreateConnectedAccountParams): Promise<{ id: string }> {
    try {
      // `express` — Stripe hosts the onboarding, the identity verification, and
      // the payout settings. We never see a bank number or a tax id, which is
      // the point: data we never hold cannot leak from here.
      const account = await this.sdk.accounts.create(
        {
          type: "express",
          country: params.country,
          email: params.email,
          business_profile: params.businessProfileName
            ? { name: params.businessProfileName }
            : undefined,
          capabilities: { transfers: { requested: true } },
          metadata: params.metadata,
        },
        params.onBehalfOfAccount ? { stripeAccount: params.onBehalfOfAccount } : undefined
      );
      return { id: account.id };
    } catch (error) {
      throw normalizeStripeError(error);
    }
  }

  async createAccountLink(params: CreateAccountLinkParams): Promise<AccountLink> {
    try {
      const link = await this.sdk.accountLinks.create(
        {
          account: params.accountId,
          refresh_url: params.refreshUrl,
          return_url: params.returnUrl,
          type: "account_onboarding",
        },
        params.onBehalfOfAccount ? { stripeAccount: params.onBehalfOfAccount } : undefined
      );
      return { url: link.url, expiresAt: link.expires_at };
    } catch (error) {
      throw normalizeStripeError(error);
    }
  }

  async getAccountStatus(
    accountId: string,
    onBehalfOfAccount?: string
  ): Promise<StripeAccountStatus> {
    try {
      const account = await this.sdk.accounts.retrieve(
        accountId,
        onBehalfOfAccount ? { stripeAccount: onBehalfOfAccount } : undefined
      );
      return {
        id: account.id,
        payoutsEnabled: account.payouts_enabled ?? false,
        chargesEnabled: account.charges_enabled ?? false,
        detailsSubmitted: account.details_submitted ?? false,
        currentlyDue: account.requirements?.currently_due ?? [],
        disabledReason: account.requirements?.disabled_reason ?? null,
      };
    } catch (error) {
      throw normalizeStripeError(error);
    }
  }
}

// ============================================================
// Fixture
// ============================================================

/**
 * An in-memory Stripe that behaves like the real one in the ways that matter.
 *
 * Specifically: it honours idempotency keys. A test that retries a transfer
 * after an ambiguous failure gets the *same* transfer back rather than a second
 * one, which is the property the whole retry path is built on — and a fixture
 * that minted a fresh id each time would make a broken retry path look correct.
 */
export class FixtureStripeClient implements StripeClient {
  readonly transfers: StripeTransferResponse[] = [];
  readonly createdAccounts: CreateConnectedAccountParams[] = [];
  readonly accountLinks: CreateAccountLinkParams[] = [];
  private readonly byIdempotencyKey = new Map<string, StripeTransferResponse>();
  private sequence = 0;
  private accountSequence = 0;

  constructor(
    private readonly config: {
      /** Destination accounts whose transfers fail, with the failure. */
      failFor?: Map<string, StripeTransferError>;
      /**
       * Account status answers. Anything absent is fully enabled — but note
       * that accounts *created* through this fixture are inserted here as
       * not-yet-enabled, so onboarding has to be walked rather than assumed.
       */
      accounts?: Map<string, StripeAccountStatus>;
    } = {}
  ) {
    this.config.accounts ??= new Map();
  }

  async createTransfer(params: StripeTransferParams): Promise<StripeTransferResponse> {
    const replayed = this.byIdempotencyKey.get(params.idempotencyKey);
    if (replayed) return replayed;

    const failure = this.config.failFor?.get(params.destination);
    if (failure) throw failure;

    if (params.amount <= 0) {
      throw new StripeTransferError(
        "Transfer amount must be positive",
        "parameter_invalid_integer",
        false
      );
    }

    const transfer: StripeTransferResponse = {
      // Derived from the idempotency key, not a counter, so two client
      // instances cannot mint the same id for different payouts — which
      // `engine_payouts_stripe_transfer_unique` would correctly reject.
      id: `tr_fixture_${params.idempotencyKey}_${++this.sequence}`,
      amount: params.amount,
      currency: params.currency.toLowerCase(),
      destination: params.destination,
      created: Math.floor(Date.now() / 1000),
    };

    this.byIdempotencyKey.set(params.idempotencyKey, transfer);
    this.transfers.push(transfer);
    return transfer;
  }

  async getAccountStatus(accountId: string): Promise<StripeAccountStatus> {
    return (
      this.config.accounts?.get(accountId) ?? {
        id: accountId,
        payoutsEnabled: true,
        chargesEnabled: true,
        detailsSubmitted: true,
        currentlyDue: [],
        disabledReason: null,
      }
    );
  }

  async createConnectedAccount(
    params: CreateConnectedAccountParams
  ): Promise<{ id: string }> {
    this.createdAccounts.push(params);
    const id = `acct_fixture_${++this.accountSequence}`;

    // A freshly created account has submitted nothing and can receive nothing.
    // Defaulting it to enabled would let a test "connect a bank" and pass a
    // payout run that would fail for real — the exact illusion the fixture
    // exists to prevent.
    this.config.accounts?.set?.(id, {
      id,
      payoutsEnabled: false,
      chargesEnabled: false,
      detailsSubmitted: false,
      currentlyDue: ["external_account", "individual.verification.document"],
      disabledReason: "requirements.past_due",
    });

    return { id };
  }

  async createAccountLink(params: CreateAccountLinkParams): Promise<AccountLink> {
    this.accountLinks.push(params);
    return {
      url: `https://connect.stripe.com/setup/fixture/${params.accountId}`,
      expiresAt: Math.floor(Date.now() / 1000) + 300,
    };
  }

  /** Let a test move an account forward the way real onboarding would. */
  setAccountStatus(accountId: string, status: Partial<StripeAccountStatus>): void {
    const existing = this.config.accounts?.get(accountId);
    this.config.accounts?.set?.(accountId, {
      id: accountId,
      payoutsEnabled: false,
      chargesEnabled: false,
      detailsSubmitted: false,
      currentlyDue: [],
      disabledReason: null,
      ...existing,
      ...status,
    });
  }
}
