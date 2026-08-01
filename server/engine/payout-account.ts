/**
 * Connecting a contributor's bank account.
 *
 * Nobody can be paid without this, however finished the rest of the engine is —
 * `selectPayoutCandidates` skips anyone with no `stripeAccountId` or with
 * `stripePayoutsEnabled` false, which today is set by hand in the database.
 * This module is what replaces the hand.
 *
 * ────────────────────────────────────────────────────────────────────────
 * WHOSE PLATFORM THE ACCOUNT BELONGS TO
 * ────────────────────────────────────────────────────────────────────────
 *
 * The contributor's connected account is created **under the tenant's own
 * Stripe account**, via the `Stripe-Account` header — the same
 * `onBehalfOfAccount` the transfer executor uses. This follows directly from
 * ratified decision #1: the contributor is the *tenant's* payee, the funds are
 * the tenant's, and money never passes through an account we control. Creating
 * these under our own platform would put us in the flow of funds and make this
 * money transmission.
 *
 * ⚠️ **This requires the tenant to have Connect enabled on their own Stripe
 * account.** That is a real onboarding requirement for every customer, not an
 * implementation detail, and it has NOT been verified against live Stripe —
 * sandboxes cannot reach `api.stripe.com`. Confirm it during the Connect
 * application before promising a customer it works. If Stripe will not allow
 * it, the fallback is that we are the platform and each tenant is a connected
 * account with `transfers` capability — which changes decision #1's shape and
 * is a conversation, not a patch.
 *
 * ────────────────────────────────────────────────────────────────────────
 * THE FOUR RULES THIS MODULE ENFORCES
 * ────────────────────────────────────────────────────────────────────────
 *
 * 1. **One Stripe account per contributor, ever.** If an id is already stored,
 *    it is reused. Creating a second on a repeat visit orphans the first — and
 *    if the first was the one that got verified, payouts go to an account the
 *    person has never seen and cannot withdraw from.
 *
 * 2. **`payoutsEnabled` only ever comes from Stripe.** Finishing the onboarding
 *    flow is not the same as being able to receive money: Stripe routinely asks
 *    for documents afterwards, and an account can be disabled again months
 *    later. Setting the flag because someone reached the return URL would let a
 *    payout run pick them up and fail every time.
 *
 * 3. **Account links are minted fresh, never stored.** Stripe expires them in
 *    minutes and they are single-use. A cached link is a support ticket.
 *
 * 4. **Country is fixed at creation and cannot be changed.** Stripe requires
 *    the account to be recreated to change it, so getting it wrong is not a
 *    quick fix — which is why it is asked for rather than assumed.
 */

import { and, eq } from "drizzle-orm";

import * as schema from "@shared/engine-schema";
import type { EngineDb } from "./ingest";
import {
  StripeTransferError,
  type StripeAccountStatus,
  type StripeClient,
} from "./adapters/stripe/client";

export class PayoutAccountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayoutAccountError";
  }
}

/**
 * What a contributor sees about their own payout setup.
 *
 * Deliberately carries no Stripe account id. It is not secret exactly, but it
 * is an identifier for someone's financial account and there is no reason for
 * it to reach a browser.
 */
export interface PayoutAccountStatus {
  /** `not_started` | `pending` | `ready` | `restricted` */
  state: "not_started" | "pending" | "ready" | "restricted";
  /** One sentence a person can act on. */
  message: string;
  /** True when a payout run would actually pay them. */
  canReceivePayouts: boolean;
  /** What Stripe is still waiting for, in plain words where we know them. */
  outstanding: string[];
  lastCheckedAt: Date | null;
}

/**
 * Stripe's requirement keys are not English. These are the ones that actually
 * come up during Express onboarding; anything unmapped is passed through rather
 * than dropped, because a requirement nobody can read still beats a blank list.
 */
const REQUIREMENT_LABELS: Record<string, string> = {
  external_account: "Bank account details",
  "individual.verification.document": "A photo of your ID",
  "individual.verification.additional_document": "A second form of ID",
  "individual.id_number": "Your tax ID number (SSN in the US)",
  "individual.ssn_last_4": "The last 4 digits of your SSN",
  "individual.address.line1": "Your address",
  "individual.dob.day": "Your date of birth",
  "company.tax_id": "The business's tax ID",
  "business_profile.url": "A website or social media link",
  "business_profile.mcc": "What kind of work you do",
  "tos_acceptance.date": "Accepting Stripe's terms",
};

export function describeRequirements(currentlyDue: string[]): string[] {
  return currentlyDue.map((key) => REQUIREMENT_LABELS[key] ?? key);
}

/** Turn a stored identity row into something a person can read. */
export function toPayoutAccountStatus(
  identity: schema.ContributorIdentity | null
): PayoutAccountStatus {
  if (!identity?.stripeAccountId) {
    return {
      state: "not_started",
      message: "You haven't set up payments yet. You'll need to before you can be paid.",
      canReceivePayouts: false,
      outstanding: [],
      lastCheckedAt: null,
    };
  }

  const requirements = (identity.stripeRequirements ?? {}) as {
    currentlyDue?: string[];
    disabledReason?: string | null;
    detailsSubmitted?: boolean;
    checkedAt?: string;
  };

  const outstanding = describeRequirements(requirements.currentlyDue ?? []);
  const lastCheckedAt = requirements.checkedAt ? new Date(requirements.checkedAt) : null;

  if (identity.stripePayoutsEnabled) {
    return {
      state: "ready",
      message: "You're all set. Payments will arrive in your connected account.",
      canReceivePayouts: true,
      // Stripe can want more paperwork for a *future* threshold while payouts
      // still work today. Showing it beats a surprise suspension later.
      outstanding,
      lastCheckedAt,
    };
  }

  if (requirements.disabledReason && requirements.detailsSubmitted) {
    return {
      state: "restricted",
      message:
        "Stripe has paused payments to your account until some details are sorted out.",
      canReceivePayouts: false,
      outstanding,
      lastCheckedAt,
    };
  }

  return {
    state: "pending",
    message:
      outstanding.length > 0
        ? "Almost there — Stripe still needs a few things from you."
        : "Stripe is reviewing your details. This usually takes a few minutes.",
    canReceivePayouts: false,
    outstanding,
    lastCheckedAt,
  };
}

async function loadIdentity(
  db: EngineDb,
  tenantId: string,
  contributorId: string
): Promise<schema.ContributorIdentity | null> {
  const [identity] = await db
    .select()
    .from(schema.contributorIdentities)
    .where(
      and(
        eq(schema.contributorIdentities.tenantId, tenantId),
        eq(schema.contributorIdentities.contributorId, contributorId)
      )
    )
    .limit(1);

  return identity ?? null;
}

export async function getPayoutAccount(
  db: EngineDb,
  tenantId: string,
  contributorId: string
): Promise<PayoutAccountStatus> {
  return toPayoutAccountStatus(await loadIdentity(db, tenantId, contributorId));
}

// ============================================================
// Starting onboarding
// ============================================================

export interface StartOnboardingOptions {
  tenantId: string;
  contributorId: string;
  client: StripeClient;
  /** Where Stripe returns the person when they finish or abandon. */
  returnUrl: string;
  /** Where Stripe sends them when the link has expired. */
  refreshUrl: string;
  /**
   * Two-letter country for a NEW account. Ignored when one already exists,
   * because Stripe cannot change it afterwards.
   */
  country?: string;
}

export interface OnboardingLink {
  url: string;
  expiresAt: Date;
  /** True when this call created the Stripe account rather than reusing one. */
  created: boolean;
}

/**
 * Get a contributor into Stripe's onboarding flow.
 *
 * Safe to call repeatedly — that is the normal case, because links expire and
 * people abandon the flow halfway. The Stripe account is created at most once;
 * every later call mints a fresh link against the same account.
 */
export async function startPayoutOnboarding(
  db: EngineDb,
  options: StartOnboardingOptions
): Promise<OnboardingLink> {
  const [tenant] = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.id, options.tenantId))
    .limit(1);

  if (!tenant) throw new PayoutAccountError("Unknown business");

  const [contributor] = await db
    .select()
    .from(schema.contributors)
    .where(
      and(
        eq(schema.contributors.tenantId, options.tenantId),
        eq(schema.contributors.id, options.contributorId)
      )
    )
    .limit(1);

  if (!contributor || contributor.deletedAt) {
    throw new PayoutAccountError("Unknown contributor");
  }

  const identity = await loadIdentity(db, options.tenantId, options.contributorId);

  let accountId = identity?.stripeAccountId ?? null;
  let created = false;

  if (!accountId) {
    const country = (options.country ?? "US").toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) {
      throw new PayoutAccountError(
        `"${options.country}" is not a two-letter country code. Stripe cannot change ` +
          "this after the account is created, so it has to be right the first time."
      );
    }

    const account = await options.client.createConnectedAccount({
      country,
      email: contributor.email ?? undefined,
      businessProfileName: tenant.name,
      metadata: {
        tenantId: options.tenantId,
        contributorId: options.contributorId,
      },
      onBehalfOfAccount: tenant.stripeAccountId ?? undefined,
    });

    accountId = account.id;
    created = true;

    // Persisted BEFORE the link is minted. If link creation fails, the account
    // still exists at Stripe — losing the id here would orphan it and the next
    // attempt would create a second one.
    if (identity) {
      await db
        .update(schema.contributorIdentities)
        .set({ stripeAccountId: accountId, updatedAt: new Date() })
        .where(eq(schema.contributorIdentities.id, identity.id));
    } else {
      await db.insert(schema.contributorIdentities).values({
        tenantId: options.tenantId,
        contributorId: options.contributorId,
        stripeAccountId: accountId,
        stripePayoutsEnabled: false,
        payoutCurrency: tenant.defaultCurrency,
      });
    }
  }

  const link = await options.client.createAccountLink({
    accountId,
    returnUrl: options.returnUrl,
    refreshUrl: options.refreshUrl,
    onBehalfOfAccount: tenant.stripeAccountId ?? undefined,
  });

  return {
    url: link.url,
    expiresAt: new Date(link.expiresAt * 1000),
    created,
  };
}

// ============================================================
// Refreshing status
// ============================================================

/**
 * Ask Stripe what it currently thinks, and store the answer.
 *
 * This is the ONLY thing that may set `stripePayoutsEnabled`. Called when a
 * contributor returns from onboarding, when they press refresh, and from the
 * `account.updated` webhook — three paths into one function, so they cannot
 * disagree about what "ready" means.
 */
export async function refreshPayoutAccount(
  db: EngineDb,
  options: { tenantId: string; contributorId: string; client: StripeClient }
): Promise<PayoutAccountStatus> {
  const identity = await loadIdentity(db, options.tenantId, options.contributorId);

  if (!identity?.stripeAccountId) {
    return toPayoutAccountStatus(identity);
  }

  const [tenant] = await db
    .select({ stripeAccountId: schema.tenants.stripeAccountId })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, options.tenantId))
    .limit(1);

  let status: StripeAccountStatus;
  try {
    status = await options.client.getAccountStatus(
      identity.stripeAccountId,
      tenant?.stripeAccountId ?? undefined
    );
  } catch (error) {
    // A failed lookup must not downgrade a working account to "not ready" —
    // that would silently drop somebody out of the next payout run because
    // Stripe had a bad minute. Keep what we last knew.
    if (error instanceof StripeTransferError) {
      throw new PayoutAccountError(
        `Could not check the payout account with Stripe: ${error.message}`
      );
    }
    throw error;
  }

  return applyAccountStatus(db, identity, status);
}

/** Write a Stripe-supplied status onto an identity row. */
export async function applyAccountStatus(
  db: EngineDb,
  identity: schema.ContributorIdentity,
  status: StripeAccountStatus
): Promise<PayoutAccountStatus> {
  const requirements = {
    currentlyDue: status.currentlyDue,
    disabledReason: status.disabledReason,
    detailsSubmitted: status.detailsSubmitted,
    chargesEnabled: status.chargesEnabled,
    checkedAt: new Date().toISOString(),
  };

  const [updated] = await db
    .update(schema.contributorIdentities)
    .set({
      stripePayoutsEnabled: status.payoutsEnabled,
      stripeRequirements: requirements,
      updatedAt: new Date(),
    })
    .where(eq(schema.contributorIdentities.id, identity.id))
    .returning();

  return toPayoutAccountStatus(updated);
}

/**
 * Handle an `account.updated` event from Stripe.
 *
 * Looks the identity up by the Stripe account id rather than trusting anything
 * in the event body about who it belongs to. Returns `null` when the account is
 * not one of ours, which is normal on a shared webhook endpoint.
 */
export async function handleAccountUpdated(
  db: EngineDb,
  status: StripeAccountStatus
): Promise<{ tenantId: string; contributorId: string } | null> {
  const [identity] = await db
    .select()
    .from(schema.contributorIdentities)
    .where(eq(schema.contributorIdentities.stripeAccountId, status.id))
    .limit(1);

  if (!identity) return null;

  await applyAccountStatus(db, identity, status);

  return { tenantId: identity.tenantId, contributorId: identity.contributorId };
}
