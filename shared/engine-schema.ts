/**
 * ENGINE SCHEMA — the revenue-split and payout platform.
 *
 * This is a **new schema built alongside** the marketplace tables in `schema.ts`,
 * not a retrofit of them (ratified decision #9). The marketplace keeps running
 * untouched on its own tables; 369 Art Collective migrates onto these as tenant #1
 * in Phase 2. Nothing here imports from `schema.ts` and nothing there imports from
 * here — the two are deliberately unlinked so the engine can outlive the
 * marketplace.
 *
 * Every table honours the §5 decisions that are expensive to retrofit:
 *
 *   #1  `tenantId` on every row. No query without tenant scope.
 *   #2  Money is `bigint` minor units. No decimal, no float, anywhere.
 *   #3  Currency code beside every amount.
 *   #4  Balances are NEVER stored. `ledgerEntries` is append-only; balance is a sum.
 *   #5  Rules are effective-dated so history is never silently rewritten.
 *   #6  Every allocation stores its inputs and the rule version that produced it.
 *   #7  Reversals are first-class rows, not deletions.
 *   #8  `(tenantId, source, sourceEventId)` is unique — replay is safe.
 *   #9  Rules are data, evaluated by an engine. No tenant-authored code.
 *   #10 Multi-party splits from the start. One event can owe many contributors.
 *   #11 Generic vocabulary (§3): contributor, work, revenue_event, allocation.
 *   #12 Payout state machine with explicit failure states.
 *   #13 Minimum thresholds and holding periods modelled up front.
 *   #14 Tax identity per contributor; tenant offboarding = export + hard delete.
 *
 * WHY BIGINT FOR MONEY. Postgres `bigint` arrives in the JS driver as a string,
 * which is deliberate: it cannot be silently coerced into a float the way `integer`
 * can. Amounts are converted at the edge in `server/engine/money.ts`. The existing
 * marketplace tables use `integer` minor units, which is fine at their scale, but
 * the engine is meant to hold other people's money and should not have a ceiling
 * measured in tens of millions of cents.
 */

import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

// ============================================================
// Enums
// ============================================================

/** Where a revenue event came from. Adapters normalize into one shape (§7). */
export const eventSourceEnum = pgEnum("engine_event_source", [
  "shopify",
  "stripe",
  "csv",
  "manual",
]);

/**
 * Sign of a revenue event.
 *
 * A refund is not a deletion and not a flag — it is a separate event with
 * `direction: 'reversal'` that references the original. This is §5 #7 and §8:
 * the original stays exactly as it was, and the correction is additive.
 */
export const eventDirectionEnum = pgEnum("engine_event_direction", [
  "sale",
  "reversal",
]);

/** What an allocation's percentage or flat amount applies to (§6 `basis`). */
export const ruleBasisEnum = pgEnum("engine_rule_basis", [
  "gross",
  "net",
  "unit",
]);

/** How the amount owed is computed (§6 `method`). */
export const ruleMethodEnum = pgEnum("engine_rule_method", [
  "percent",
  "flat_per_unit",
  "flat_per_event",
  "tiered",
]);

/**
 * What a rule applies to. Narrower scope wins over broader when both match —
 * see `priority` on `splitRules`.
 */
export const ruleScopeEnum = pgEnum("engine_rule_scope", [
  "tenant",
  "contributor",
  "work",
  "product_type",
]);

/**
 * What happens when money is clawed back after a contributor was paid (§8).
 * Configurable per tenant because the right answer is a business decision:
 *   recoup — offset against the contributor's future earnings (most common)
 *   absorb — the tenant eats it
 *   reserve — hold a % of every payout against future refunds, release after N days
 */
export const clawbackPolicyEnum = pgEnum("engine_clawback_policy", [
  "recoup",
  "absorb",
  "reserve",
]);

/** §5 #12 — payouts fail, accounts freeze, batches partially complete. */
export const payoutStatusEnum = pgEnum("engine_payout_status", [
  "pending",
  "processing",
  "paid",
  "failed",
  "retrying",
  "cancelled",
]);

export const payoutBatchStatusEnum = pgEnum("engine_payout_batch_status", [
  "open",
  "processing",
  "completed",
  "completed_with_failures",
  "cancelled",
]);

/** Why a ledger entry exists. The ledger is append-only, so this is its reason. */
export const ledgerEntryTypeEnum = pgEnum("engine_ledger_entry_type", [
  "allocation", // contributor earned money from an event
  "reversal", // an earlier allocation was reversed
  "adjustment", // manual correction or bonus
  "payout", // money left for the contributor
  "payout_reversal", // a failed payout returned the balance
]);

export const adjustmentReasonEnum = pgEnum("engine_adjustment_reason", [
  "manual_correction",
  "bonus",
  "clawback_recoup",
  "write_off",
]);

/** W-9 / W-8BEN collection status (§5 #14). Mostly delegated to Stripe Connect. */
export const taxIdentityStatusEnum = pgEnum("engine_tax_identity_status", [
  "not_collected",
  "pending",
  "collected",
  "invalid",
]);

/**
 * Lifecycle of a link to an external system.
 *
 * `revoked` is distinct from `disconnected` on purpose: the merchant uninstalling
 * our app and an owner switching stores look identical in the data but need
 * different responses — one is a support conversation, the other is routine.
 */
export const connectionStatusEnum = pgEnum("engine_connection_status", [
  "pending",
  "active",
  "disconnected",
  "revoked",
  "error",
]);

// ============================================================
// Tenancy
// ============================================================

/**
 * The paying customer — a merchant, label, or press.
 *
 * Note what is NOT here: any balance, any total, any cached figure. Everything
 * financial is derived from `ledgerEntries` by query (§5 #4).
 */
export const tenants = pgTable(
  "engine_tenants",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    slug: text("slug").notNull(),

    /** Default currency for new rules and payouts. USD-only in Phase 1 (#6). */
    defaultCurrency: text("default_currency").notNull().default("USD"),

    /**
     * The tenant's own Stripe Connect platform account. We never hold funds
     * (ratified decision #1) — we calculate and instruct against this.
     */
    stripeAccountId: text("stripe_account_id"),

    clawbackPolicy: clawbackPolicyEnum("clawback_policy").notNull().default("recoup"),

    /**
     * §5 #13 / §8. Do not pay out until the refund window has largely closed.
     * Nearly free to build up front and prevents most clawback pain.
     */
    payoutHoldDays: integer("payout_hold_days").notNull().default(14),
    minimumPayoutMinor: bigint("minimum_payout_minor", { mode: "bigint" })
      .notNull()
      .default(sql`1000`),

    /** For `reserve` clawback policy: basis points held back from each payout. */
    reserveBasisPoints: integer("reserve_basis_points").notNull().default(0),
    reserveReleaseDays: integer("reserve_release_days").notNull().default(90),

    /** §5 #14 — offboarding is export then hard delete, not a soft flag forever. */
    offboardingRequestedAt: timestamp("offboarding_requested_at"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    slugUnique: uniqueIndex("engine_tenants_slug_unique").on(table.slug),
  })
);

/** Humans who administer a tenant. */
export const tenantUsers = pgTable(
  "engine_tenant_users",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    role: text("role").notNull().default("admin"), // admin | viewer
    lastLoginAt: timestamp("last_login_at"),
    deletedAt: timestamp("deleted_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    tenantEmailUnique: uniqueIndex("engine_tenant_users_tenant_email_unique").on(
      table.tenantId,
      table.email
    ),
    tenantIdx: index("engine_tenant_users_tenant_idx").on(table.tenantId),
  })
);

// ============================================================
// Contributors and works
// ============================================================

/**
 * A person owed money, scoped to a tenant.
 *
 * `externalRef` is how an adapter finds them — a SKU fragment, a vendor name, a
 * CSV column value. Attribution is configurable per tenant (§7), so this is a
 * lookup target rather than a parsed-out identity.
 */
export const contributors = pgTable(
  "engine_contributors",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),

    /** Stable reference used by adapters to attribute revenue to this person. */
    externalRef: text("external_ref"),

    /** Ratified decision #2 — contributors get a login in Phase 1. */
    passwordHash: text("password_hash"),
    lastLoginAt: timestamp("last_login_at"),

    active: boolean("active").notNull().default(true),
    deletedAt: timestamp("deleted_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index("engine_contributors_tenant_idx").on(table.tenantId),
    tenantRefUnique: uniqueIndex("engine_contributors_tenant_ref_unique").on(
      table.tenantId,
      table.externalRef
    ),
    tenantEmailIdx: index("engine_contributors_tenant_email_idx").on(
      table.tenantId,
      table.email
    ),
  })
);

/**
 * Tax and payout identity (§5 #14).
 *
 * Split from `contributors` because it has a different lifecycle and a different
 * sensitivity: it holds PII that GDPR/CCPA deletion obligations attach to, and it
 * is mostly maintained by Stripe rather than by us.
 */
export const contributorIdentities = pgTable(
  "engine_contributor_identities",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    contributorId: varchar("contributor_id")
      .notNull()
      .references(() => contributors.id, { onDelete: "cascade" }),

    stripeAccountId: text("stripe_account_id"),
    stripePayoutsEnabled: boolean("stripe_payouts_enabled").notNull().default(false),
    stripeRequirements: jsonb("stripe_requirements"),

    taxFormType: text("tax_form_type"), // W-9 | W-8BEN
    taxIdentityStatus: taxIdentityStatusEnum("tax_identity_status")
      .notNull()
      .default("not_collected"),
    taxIdentityCollectedAt: timestamp("tax_identity_collected_at"),

    /** Payout currency, which need not match the tenant's default. */
    payoutCurrency: text("payout_currency").notNull().default("USD"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    contributorUnique: uniqueIndex("engine_contributor_identities_contributor_unique").on(
      table.contributorId
    ),
    tenantIdx: index("engine_contributor_identities_tenant_idx").on(table.tenantId),
  })
);

/**
 * The thing that earns — a product, track, or title. Optional: some verticals
 * attribute straight to a contributor with no intermediate work.
 */
export const works = pgTable(
  "engine_works",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    externalRef: text("external_ref"),
    productType: text("product_type"), // matches `product_type` rule scope
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index("engine_works_tenant_idx").on(table.tenantId),
    tenantRefUnique: uniqueIndex("engine_works_tenant_ref_unique").on(
      table.tenantId,
      table.externalRef
    ),
  })
);

/**
 * Who is owed something from a work, and in what role.
 *
 * This table is the whole reason §5 #10 exists. A schema that hangs one
 * contributor off a work is a rewrite the first time a co-authored book or a
 * track with a producer arrives. Making it many-to-many now costs one table.
 */
export const workContributors = pgTable(
  "engine_work_contributors",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    workId: varchar("work_id")
      .notNull()
      .references(() => works.id, { onDelete: "cascade" }),
    contributorId: varchar("contributor_id")
      .notNull()
      .references(() => contributors.id, { onDelete: "cascade" }),
    /** e.g. artist, producer, writer, illustrator. Rules may target a role. */
    role: text("role"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    workContributorRoleUnique: uniqueIndex(
      "engine_work_contributors_unique"
    ).on(table.workId, table.contributorId, table.role),
    tenantIdx: index("engine_work_contributors_tenant_idx").on(table.tenantId),
    contributorIdx: index("engine_work_contributors_contributor_idx").on(
      table.contributorId
    ),
  })
);

// ============================================================
// Revenue events
// ============================================================

/**
 * A canonical, normalized transaction — the output of every adapter (§7).
 *
 * The unique index on `(tenantId, source, sourceEventId)` is §5 #8 and is the
 * single most important constraint in this schema. Webhooks are re-delivered,
 * CSVs are re-uploaded, and operators re-run imports. Without it, every one of
 * those pays somebody twice.
 */
export const revenueEvents = pgTable(
  "engine_revenue_events",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    source: eventSourceEnum("source").notNull(),
    /** The source system's own ID for this transaction. Idempotency key. */
    sourceEventId: text("source_event_id").notNull(),

    direction: eventDirectionEnum("direction").notNull().default("sale"),
    /**
     * For a reversal: the event being reversed. Never null on a reversal, always
     * null on a sale. The reversal references the original rather than mutating
     * it, so the original's allocations stay reconstructable forever.
     */
    reversesEventId: varchar("reverses_event_id").references((): any => revenueEvents.id),

    occurredAt: timestamp("occurred_at").notNull(),

    /**
     * Gross, in minor units. Positive on a sale, NEGATIVE on a reversal — the
     * sign lives on the amount rather than being implied by `direction`, so that
     * summing the ledger never requires a conditional.
     */
    grossAmountMinor: bigint("gross_amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),
    quantity: integer("quantity").notNull().default(1),

    workId: varchar("work_id").references(() => works.id),

    /** Unresolved reference from the source, kept for audit even once resolved. */
    workRef: text("work_ref"),

    /**
     * Set when the event could not be fully resolved — unknown work, unknown
     * contributor, unresolvable cost. Carries the same meaning as `needs_review`
     * in the marketplace order processor: recorded, but nothing is owed from it
     * until a human intervenes. Never guess and pay.
     */
    needsReview: boolean("needs_review").notNull().default(false),
    reviewReason: text("review_reason"),

    /** Raw adapter payload, for reconstructing what we were actually told. */
    metadata: jsonb("metadata"),

    ingestedAt: timestamp("ingested_at").notNull().defaultNow(),
  },
  (table) => ({
    /** §5 #8 — generalized idempotency. */
    sourceUnique: uniqueIndex("engine_revenue_events_source_unique").on(
      table.tenantId,
      table.source,
      table.sourceEventId
    ),
    tenantOccurredIdx: index("engine_revenue_events_tenant_occurred_idx").on(
      table.tenantId,
      table.occurredAt
    ),
    tenantReviewIdx: index("engine_revenue_events_tenant_review_idx").on(
      table.tenantId,
      table.needsReview
    ),
    reversesIdx: index("engine_revenue_events_reverses_idx").on(table.reversesEventId),
  })
);

/**
 * A cost attached to a revenue event — COGS, shipping, fees, discounts.
 *
 * Costs are rows rather than columns because which costs subtract before "net"
 * is configurable per rule (§6 `cost_deductions`). A tenant who treats shipping
 * as their own overhead and a tenant who passes it through both need to be
 * expressible without a schema change.
 */
export const costComponents = pgTable(
  "engine_cost_components",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    revenueEventId: varchar("revenue_event_id")
      .notNull()
      .references(() => revenueEvents.id, { onDelete: "cascade" }),

    /** production | shipping | processing_fee | discount | platform_fee | ... */
    type: text("type").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),

    /** Where the number came from, so a stale cost is auditable. */
    source: text("source"),
    resolvedAt: timestamp("resolved_at"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    eventTypeUnique: uniqueIndex("engine_cost_components_event_type_unique").on(
      table.revenueEventId,
      table.type
    ),
    tenantIdx: index("engine_cost_components_tenant_idx").on(table.tenantId),
  })
);

// ============================================================
// Split rules (§6)
// ============================================================

/**
 * An effective-dated, versioned split rule. Data, never code (§5 #9, decision #7).
 *
 * TWO PROPERTIES THAT MUST NOT BE COMPROMISED:
 *
 * 1. **`version` is immutable once used.** Editing a rule that has already
 *    produced allocations creates a NEW version. Allocations reference the exact
 *    version that produced them, so a payout from eight months ago can always be
 *    explained with the rule as it read that day.
 *
 * 2. **`effectiveFrom`/`effectiveTo` bound the rule in time.** A rate that
 *    changed on March 1 must not silently rewrite February's history (§5 #5).
 *    Rule selection is always relative to the event's `occurredAt`, never to now.
 */
export const splitRules = pgTable(
  "engine_split_rules",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /** Stable identity across versions. All versions of a rule share this. */
    ruleKey: varchar("rule_key").notNull(),
    version: integer("version").notNull(),

    effectiveFrom: timestamp("effective_from").notNull(),
    effectiveTo: timestamp("effective_to"),

    scope: ruleScopeEnum("scope").notNull(),
    /** Target of the scope: contributorId, workId, or a product_type string. */
    scopeRef: text("scope_ref"),

    /** Which contributor this rule pays. Null means "the event's contributor". */
    contributorId: varchar("contributor_id").references(() => contributors.id),
    /** Optionally restrict to a role on the work, for multi-party splits. */
    role: text("role"),

    basis: ruleBasisEnum("basis").notNull(),
    method: ruleMethodEnum("method").notNull(),

    /** Percent in BASIS POINTS (3000 = 30%), or a flat amount in minor units. */
    valueBasisPoints: integer("value_basis_points"),
    valueMinor: bigint("value_minor", { mode: "bigint" }),

    /**
     * For `tiered`: [{ minMinor, basisPoints }], evaluated against the
     * contributor's trailing volume. Stored as data so a tenant can have a
     * different ladder without a deploy.
     */
    tierTable: jsonb("tier_table"),

    /**
     * Which `costComponents.type` values subtract before "net". Only meaningful
     * when `basis = 'net'`. Empty means net equals gross.
     */
    costDeductions: text("cost_deductions").array().default(sql`ARRAY[]::text[]`),

    /** Specificity wins. Higher priority is evaluated first. */
    priority: integer("priority").notNull().default(0),

    currency: text("currency").notNull().default("USD"),
    active: boolean("active").notNull().default(true),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    createdBy: varchar("created_by").references(() => tenantUsers.id),
  },
  (table) => ({
    keyVersionUnique: uniqueIndex("engine_split_rules_key_version_unique").on(
      table.tenantId,
      table.ruleKey,
      table.version
    ),
    tenantActiveIdx: index("engine_split_rules_tenant_active_idx").on(
      table.tenantId,
      table.active
    ),
    tenantEffectiveIdx: index("engine_split_rules_tenant_effective_idx").on(
      table.tenantId,
      table.effectiveFrom,
      table.effectiveTo
    ),
  })
);

// ============================================================
// Allocations and ledger
// ============================================================

/**
 * "Contributor X is owed Y from event Z under rule version V."
 *
 * THIS TABLE IS THE PRODUCT. §5 #6 calls the stored explanation "the #1 reason a
 * merchant would trust you over their spreadsheet", and it is the thing that makes
 * a disputed payout answerable eight months later.
 *
 * So the inputs are snapshotted, not referenced: `basisAmountMinor`,
 * `grossAmountMinor`, `deductedCostsMinor` and `rateBasisPoints` record what the
 * numbers actually were at calculation time. Re-deriving them later from the
 * event and the rule would produce today's answer to yesterday's question, which
 * is precisely the failure the marketplace's recalculate-at-payout had.
 */
export const allocations = pgTable(
  "engine_allocations",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    revenueEventId: varchar("revenue_event_id")
      .notNull()
      .references(() => revenueEvents.id, { onDelete: "cascade" }),
    contributorId: varchar("contributor_id")
      .notNull()
      .references(() => contributors.id),

    /** The exact rule version that produced this. Never just the ruleKey. */
    splitRuleId: varchar("split_rule_id").references(() => splitRules.id),
    ruleKey: varchar("rule_key"),
    ruleVersion: integer("rule_version"),

    /** The amount owed. Negative on a reversal. */
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),

    // ---- Snapshotted inputs: the explanation trace ----
    grossAmountMinor: bigint("gross_amount_minor", { mode: "bigint" }).notNull(),
    deductedCostsMinor: bigint("deducted_costs_minor", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    /** What the percentage was actually applied to (gross or net). */
    basisAmountMinor: bigint("basis_amount_minor", { mode: "bigint" }).notNull(),
    basis: ruleBasisEnum("basis").notNull(),
    method: ruleMethodEnum("method").notNull(),
    rateBasisPoints: integer("rate_basis_points"),

    /**
     * Human-readable derivation, e.g.
     * "net $72.88 = gross $99.00 − production $15.00 − shipping $8.00 − fee $3.12;
     *  30% of net = $21.86 (rule artist-standard v3)".
     * Rendered on the contributor's statement.
     */
    explanation: text("explanation"),
    /** Machine-readable trace for the UI to render structurally. */
    trace: jsonb("trace"),

    /** For a reversal allocation: the allocation being reversed. */
    reversesAllocationId: varchar("reverses_allocation_id").references(
      (): any => allocations.id
    ),

    calculatedAt: timestamp("calculated_at").notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index("engine_allocations_tenant_idx").on(table.tenantId),
    eventIdx: index("engine_allocations_event_idx").on(table.revenueEventId),
    contributorIdx: index("engine_allocations_contributor_idx").on(
      table.tenantId,
      table.contributorId
    ),
    reversesIdx: index("engine_allocations_reverses_idx").on(table.reversesAllocationId),
    /**
     * One allocation per (event, contributor, rule version). Makes replaying an
     * event idempotent at the allocation layer too, not just at ingestion.
     */
    eventContributorRuleUnique: uniqueIndex(
      "engine_allocations_event_contributor_rule_unique"
    ).on(table.revenueEventId, table.contributorId, table.splitRuleId),
  })
);

/**
 * The immutable ledger. Append-only. NEVER UPDATED, NEVER DELETED.
 *
 * §5 #4: a contributor's balance is `SUM(amountMinor)` over their entries, not a
 * stored column. The marketplace's `artists.monthlySales` is exactly the drift bug
 * this prevents — and the marketplace's own `influencers` table already carries a
 * comment saying so.
 *
 * Signs: allocations and adjustments are positive when they increase what the
 * contributor is owed; payouts are negative; reversals are negative. Balances are
 * legally negative — a clawback on a contributor who has already been paid out
 * puts them in deficit until future earnings recoup it (§8).
 */
export const ledgerEntries = pgTable(
  "engine_ledger_entries",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    contributorId: varchar("contributor_id")
      .notNull()
      .references(() => contributors.id),

    entryType: ledgerEntryTypeEnum("entry_type").notNull(),

    /** Signed. Positive increases what the contributor is owed. */
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),

    /** Whichever of these applies; exactly one is normally set. */
    allocationId: varchar("allocation_id").references(() => allocations.id),
    payoutId: varchar("payout_id").references((): any => payouts.id),
    adjustmentId: varchar("adjustment_id").references((): any => adjustments.id),

    /**
     * When this entry becomes payable. Allocations land with a hold derived from
     * `tenants.payoutHoldDays` (§5 #13, §8) so money is not paid out before the
     * refund window has largely closed.
     */
    availableAt: timestamp("available_at"),

    description: text("description"),
    occurredAt: timestamp("occurred_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    /** The index that makes balance-by-query fast enough to never cache. */
    contributorBalanceIdx: index("engine_ledger_contributor_balance_idx").on(
      table.tenantId,
      table.contributorId,
      table.occurredAt
    ),
    availableIdx: index("engine_ledger_available_idx").on(
      table.tenantId,
      table.availableAt
    ),
    allocationIdx: index("engine_ledger_allocation_idx").on(table.allocationId),
    payoutIdx: index("engine_ledger_payout_idx").on(table.payoutId),
  })
);

/** Manual corrections, bonuses, and clawback recoupments. */
export const adjustments = pgTable(
  "engine_adjustments",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    contributorId: varchar("contributor_id")
      .notNull()
      .references(() => contributors.id),

    reason: adjustmentReasonEnum("reason").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),
    note: text("note"),

    /** For clawback recoupments: which reversal this is recovering. */
    relatedAllocationId: varchar("related_allocation_id").references(
      () => allocations.id
    ),

    createdBy: varchar("created_by").references(() => tenantUsers.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index("engine_adjustments_tenant_idx").on(table.tenantId),
    contributorIdx: index("engine_adjustments_contributor_idx").on(table.contributorId),
  })
);

// ============================================================
// Payouts (§5 #12)
// ============================================================

export const payoutBatches = pgTable(
  "engine_payout_batches",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    status: payoutBatchStatusEnum("status").notNull().default("open"),

    /** Only ledger entries available at or before this instant are included. */
    availableAsOf: timestamp("available_as_of").notNull(),

    currency: text("currency").notNull(),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdBy: varchar("created_by").references(() => tenantUsers.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index("engine_payout_batches_tenant_idx").on(table.tenantId),
  })
);

/**
 * One contributor's disbursement within a batch.
 *
 * The state machine is explicit rather than a boolean because every one of these
 * states happens in production: Stripe accounts freeze mid-batch, transfers fail
 * and are retried, and a batch routinely completes with some payouts failed.
 */
export const payouts = pgTable(
  "engine_payouts",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    batchId: varchar("batch_id").references(() => payoutBatches.id),
    contributorId: varchar("contributor_id")
      .notNull()
      .references(() => contributors.id),

    status: payoutStatusEnum("status").notNull().default("pending"),

    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),

    /** Withheld under a `reserve` clawback policy; released after N days. */
    reserveHeldMinor: bigint("reserve_held_minor", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    reserveReleaseAt: timestamp("reserve_release_at"),

    stripeTransferId: text("stripe_transfer_id"),
    failureReason: text("failure_reason"),
    attemptCount: integer("attempt_count").notNull().default(0),

    initiatedAt: timestamp("initiated_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index("engine_payouts_tenant_idx").on(table.tenantId),
    contributorIdx: index("engine_payouts_contributor_idx").on(table.contributorId),
    batchIdx: index("engine_payouts_batch_idx").on(table.batchId),
    /** Reconciliation against Stripe; also blocks a double transfer. */
    stripeTransferUnique: uniqueIndex("engine_payouts_stripe_transfer_unique").on(
      table.stripeTransferId
    ),
  })
);

// ============================================================
// Source connections
// ============================================================

/**
 * A tenant's link to an external system — the Shopify store whose orders arrive
 * as revenue events, or the Stripe account payouts are instructed against.
 *
 * WHY THIS IS A TABLE RATHER THAN ENVIRONMENT VARIABLES. The marketplace reads
 * `SHOPIFY_ACCESS_TOKEN` from the process environment because it serves exactly
 * one store. The engine serves many tenants at once, and an inbound webhook
 * arrives identified only by its shop domain — so the domain has to be a lookup
 * key into per-tenant credentials, not a constant.
 *
 * WHY THE CREDENTIAL COLUMNS ARE SEALED. `credentialSealed` and
 * `webhookSecretSealed` hold AES-256-GCM ciphertext from `secrets.ts`, never
 * plaintext. A Shopify offline access token is a standing grant to read a
 * merchant's orders and a database backup is a file that gets copied around;
 * the two should not meet. The sealing key lives in `ENGINE_SECRET_KEY` and is
 * never stored here.
 *
 * `externalRef` is the provider's own identifier for the connection — the
 * `myshopify.com` domain for Shopify, the `acct_…` id for Stripe — and is what
 * an inbound webhook is matched on. It is unique per provider across ALL
 * tenants, deliberately: one store belongs to one tenant, and two tenants
 * claiming the same store is a misconfiguration that should fail at write time
 * rather than route someone else's revenue into the wrong ledger.
 */
export const sourceConnections = pgTable(
  "engine_source_connections",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /** `shopify` | `stripe`. Free text rather than an enum so adding an adapter
     *  is a code change, not a migration. */
    provider: text("provider").notNull(),

    /** The provider's identifier for this connection. Webhook routing key. */
    externalRef: text("external_ref").notNull(),

    /** Human label shown in the console: "369artcollective.myshopify.com". */
    label: text("label"),

    status: connectionStatusEnum("status").notNull().default("pending"),

    /** AES-256-GCM ciphertext. Never plaintext. See `server/engine/secrets.ts`. */
    credentialSealed: text("credential_sealed"),
    webhookSecretSealed: text("webhook_secret_sealed"),

    /** OAuth scopes actually granted, so a missing scope is diagnosable. */
    scopes: jsonb("scopes"),

    /**
     * Adapter configuration — for Shopify, where the work reference is read
     * from and what to do about payment fees. Per connection rather than per
     * tenant because a tenant may eventually run two stores with different
     * conventions, and because these are the settings an owner changes when
     * every sale starts landing in the review queue.
     */
    settings: jsonb("settings"),

    /** Set when the provider last rejected our credential — the signal to reconnect. */
    lastErrorAt: timestamp("last_error_at"),
    lastError: text("last_error"),

    /** Set on every successfully processed inbound event. Staleness is a symptom. */
    lastEventAt: timestamp("last_event_at"),

    connectedAt: timestamp("connected_at"),
    disconnectedAt: timestamp("disconnected_at"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    providerRefUnique: uniqueIndex("engine_source_connections_provider_ref_unique").on(
      table.provider,
      table.externalRef
    ),
    tenantProviderIdx: index("engine_source_connections_tenant_provider_idx").on(
      table.tenantId,
      table.provider
    ),
  })
);

// ============================================================
// Audit
// ============================================================

/** Who changed what, when. Rule edits especially — they move money. */
export const auditLog = pgTable(
  "engine_audit_log",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    actorType: text("actor_type").notNull(), // tenant_user | contributor | system
    actorId: varchar("actor_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: varchar("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  },
  (table) => ({
    tenantOccurredIdx: index("engine_audit_tenant_occurred_idx").on(
      table.tenantId,
      table.occurredAt
    ),
    entityIdx: index("engine_audit_entity_idx").on(table.entityType, table.entityId),
  })
);

// ============================================================
// Inferred types
// ============================================================

export type Tenant = typeof tenants.$inferSelect;
export type TenantUser = typeof tenantUsers.$inferSelect;
export type Contributor = typeof contributors.$inferSelect;
export type ContributorIdentity = typeof contributorIdentities.$inferSelect;
export type Work = typeof works.$inferSelect;
export type WorkContributor = typeof workContributors.$inferSelect;
export type RevenueEventRow = typeof revenueEvents.$inferSelect;
export type CostComponent = typeof costComponents.$inferSelect;
export type SplitRule = typeof splitRules.$inferSelect;
export type Allocation = typeof allocations.$inferSelect;
export type LedgerEntry = typeof ledgerEntries.$inferSelect;
export type Adjustment = typeof adjustments.$inferSelect;
export type PayoutBatch = typeof payoutBatches.$inferSelect;
export type Payout = typeof payouts.$inferSelect;
export type SourceConnection = typeof sourceConnections.$inferSelect;
