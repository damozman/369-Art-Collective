/**
 * Writes from the admin console.
 *
 * THE INVARIANT THIS FILE EXISTS TO PROTECT: changing a rate creates a NEW
 * VERSION. It never edits the rule that produced past payments.
 *
 * Allocations snapshot their own inputs, so a past payment could not silently
 * change even if a rule row were edited — but the rule row is also the record of
 * *what the deal was* on a given date, and rewriting it destroys the ability to
 * answer "what were we agreeing to in March?". Versioning keeps both the payment
 * and the agreement reconstructable.
 *
 * A consequence worth stating plainly, because owners expect otherwise:
 * **changing a rate does not recalculate anything.** It applies to sales recorded
 * from its effective date onward. Past sales keep what they were paid. That is
 * the point, not a limitation — see `docs/SOP.md` §4.
 */

import { and, desc, eq, sql } from "drizzle-orm";

import * as schema from "@shared/engine-schema";
import { hashPassword } from "./auth";
import type { EngineDb } from "./ingest";
import { parseDecimalToMinor } from "./money";

export class AdminValidationError extends Error {}

// ============================================================
// Rules
// ============================================================

export interface RuleInput {
  /** Stable identity across versions. New key = new rule; existing = new version. */
  ruleKey: string;
  scope: "tenant" | "contributor" | "work" | "product_type";
  scopeRef?: string | null;
  contributorId?: string | null;
  role?: string | null;
  basis: "gross" | "net" | "unit";
  method: "percent" | "flat_per_unit" | "flat_per_event" | "tiered";
  /** For percent/tiered: whole percent, e.g. 30 or 32.5. Converted to basis points. */
  percent?: number | null;
  /** For flat methods: minor units. */
  flatMinor?: bigint | null;
  tierTable?: Array<{ minMinor: string; basisPoints: number }> | null;
  costDeductions?: string[];
  priority?: number;
  effectiveFrom?: Date;
}

function validateRuleInput(input: RuleInput): void {
  if (!input.ruleKey || !/^[a-z0-9][a-z0-9-]*$/i.test(input.ruleKey)) {
    throw new AdminValidationError(
      "A rate needs a short name using letters, numbers and dashes"
    );
  }

  if (input.scope !== "tenant" && !input.scopeRef) {
    throw new AdminValidationError(
      `A ${input.scope} rate needs to say which ${input.scope} it applies to`
    );
  }

  if (input.method === "percent" || input.method === "tiered") {
    if (input.method === "percent") {
      if (input.percent === null || input.percent === undefined) {
        throw new AdminValidationError("A percentage rate needs a percentage");
      }
      if (input.percent < 0 || input.percent > 100) {
        throw new AdminValidationError("A percentage must be between 0 and 100");
      }
      // Basis points are the storage unit, so finer than 0.01% cannot be held
      // exactly and would be silently rounded.
      if (Math.abs(Math.round(input.percent * 100) - input.percent * 100) > 1e-9) {
        throw new AdminValidationError(
          "A percentage can have at most two decimal places"
        );
      }
    } else if (!input.tierTable || input.tierTable.length === 0) {
      throw new AdminValidationError("A tiered rate needs at least one tier");
    }
  } else {
    if (input.flatMinor === null || input.flatMinor === undefined) {
      throw new AdminValidationError("A flat rate needs an amount");
    }
    if (input.flatMinor < 0n) {
      throw new AdminValidationError("A flat rate cannot be negative");
    }
  }

  if (input.tierTable) {
    const hasZeroRung = input.tierTable.some((t) => BigInt(t.minMinor) === 0n);
    if (!hasZeroRung) {
      // Without a rung at zero, a contributor with no history matches nothing
      // and the engine throws mid-ingest rather than at save time.
      throw new AdminValidationError(
        "A tiered rate needs a tier starting at 0, for people with no sales yet"
      );
    }
  }
}

function toBasisPoints(percent: number): number {
  return Math.round(percent * 100);
}

/**
 * Create the first version of a new rate.
 *
 * Rejects a duplicate key rather than silently versioning it — "create" and
 * "change" are different intentions and conflating them is how someone
 * accidentally supersedes a live rate.
 */
export async function createRule(
  db: EngineDb,
  tenantId: string,
  input: RuleInput,
  createdBy?: string
): Promise<string> {
  validateRuleInput(input);

  const [existing] = await db
    .select({ id: schema.splitRules.id })
    .from(schema.splitRules)
    .where(
      and(
        eq(schema.splitRules.tenantId, tenantId),
        eq(schema.splitRules.ruleKey, input.ruleKey)
      )
    )
    .limit(1);

  if (existing) {
    throw new AdminValidationError(
      `A rate called "${input.ruleKey}" already exists. Change it instead of creating another.`
    );
  }

  const [row] = await db
    .insert(schema.splitRules)
    .values({
      tenantId,
      ruleKey: input.ruleKey,
      version: 1,
      effectiveFrom: input.effectiveFrom ?? new Date(),
      scope: input.scope,
      scopeRef: input.scopeRef ?? null,
      contributorId: input.contributorId ?? null,
      role: input.role ?? null,
      basis: input.basis,
      method: input.method,
      valueBasisPoints:
        input.percent === null || input.percent === undefined
          ? null
          : toBasisPoints(input.percent),
      valueMinor: input.flatMinor ?? null,
      tierTable: input.tierTable ?? null,
      costDeductions: input.costDeductions ?? [],
      priority: input.priority ?? 0,
      currency: "USD",
      createdBy: createdBy ?? null,
    })
    .returning({ id: schema.splitRules.id });

  return row.id;
}

/**
 * Change a rate by superseding it with a new version.
 *
 * The previous version is not edited except to close its effective window at the
 * moment the new one opens. That boundary is the only mutation permitted on a
 * rule that has already paid people, and it affects rule *selection* for future
 * events only — every past allocation carries its own snapshot and is untouched.
 */
export async function supersedeRule(
  db: EngineDb,
  tenantId: string,
  input: RuleInput,
  createdBy?: string
): Promise<{ id: string; version: number }> {
  validateRuleInput(input);

  const [current] = await db
    .select()
    .from(schema.splitRules)
    .where(
      and(
        eq(schema.splitRules.tenantId, tenantId),
        eq(schema.splitRules.ruleKey, input.ruleKey)
      )
    )
    .orderBy(desc(schema.splitRules.version))
    .limit(1);

  if (!current) {
    throw new AdminValidationError(
      `No rate called "${input.ruleKey}" to change. Create it first.`
    );
  }

  const effectiveFrom = input.effectiveFrom ?? new Date();

  if (effectiveFrom < current.effectiveFrom) {
    throw new AdminValidationError(
      "A change cannot start before the version it replaces. " +
        "Backdating would leave a gap where no rate applied."
    );
  }

  return db.transaction(async (tx) => {
    // Close the outgoing version exactly where the new one begins: no gap, no
    // overlap. `isEffectiveAt` treats `effectiveTo` as exclusive, so a sale at
    // that precise instant lands on the new version.
    await tx
      .update(schema.splitRules)
      .set({ effectiveTo: effectiveFrom })
      .where(eq(schema.splitRules.id, current.id));

    const [row] = await tx
      .insert(schema.splitRules)
      .values({
        tenantId,
        ruleKey: input.ruleKey,
        version: current.version + 1,
        effectiveFrom,
        scope: input.scope,
        scopeRef: input.scopeRef ?? null,
        contributorId: input.contributorId ?? null,
        role: input.role ?? null,
        basis: input.basis,
        method: input.method,
        valueBasisPoints:
          input.percent === null || input.percent === undefined
            ? null
            : toBasisPoints(input.percent),
        valueMinor: input.flatMinor ?? null,
        tierTable: input.tierTable ?? null,
        costDeductions: input.costDeductions ?? [],
        priority: input.priority ?? 0,
        currency: "USD",
        createdBy: createdBy ?? null,
      })
      .returning({ id: schema.splitRules.id, version: schema.splitRules.version });

    return row;
  });
}

/**
 * Stop a rate applying, without deleting it.
 *
 * Deactivating rather than deleting keeps the historical record of what the deal
 * was, which is the whole reason rules are versioned. A deleted rule would leave
 * old allocations referencing something that no longer exists.
 */
export async function deactivateRule(
  db: EngineDb,
  tenantId: string,
  ruleKey: string
): Promise<void> {
  const updated = await db
    .update(schema.splitRules)
    .set({ active: false, effectiveTo: sql`COALESCE(${schema.splitRules.effectiveTo}, NOW())` })
    .where(
      and(
        eq(schema.splitRules.tenantId, tenantId),
        eq(schema.splitRules.ruleKey, ruleKey),
        eq(schema.splitRules.active, true)
      )
    )
    .returning({ id: schema.splitRules.id });

  if (updated.length === 0) {
    throw new AdminValidationError(`No active rate called "${ruleKey}"`);
  }
}

// ============================================================
// Contributors
// ============================================================

export interface ContributorInput {
  name: string;
  email?: string | null;
  /**
   * How incoming sales refer to this person — a SKU fragment, a vendor name, a
   * CSV column value. Attribution depends on it, so it must be unique per tenant.
   */
  externalRef?: string | null;
  password?: string | null;
}

function validateContributorInput(input: ContributorInput): void {
  if (!input.name || input.name.trim().length === 0) {
    throw new AdminValidationError("A name is required");
  }
  if (input.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email)) {
    throw new AdminValidationError("That email address does not look right");
  }
}

export async function createContributor(
  db: EngineDb,
  tenantId: string,
  input: ContributorInput
): Promise<string> {
  validateContributorInput(input);

  const passwordHash = input.password ? await hashPassword(input.password) : null;

  try {
    const [row] = await db
      .insert(schema.contributors)
      .values({
        tenantId,
        name: input.name.trim(),
        email: input.email?.toLowerCase().trim() ?? null,
        externalRef: input.externalRef?.trim() || null,
        passwordHash,
      })
      .returning({ id: schema.contributors.id });

    return row.id;
  } catch (error) {
    throw translateUniqueViolation(error, input.externalRef ?? "");
  }
}

export async function updateContributor(
  db: EngineDb,
  tenantId: string,
  contributorId: string,
  input: Partial<ContributorInput> & { active?: boolean }
): Promise<void> {
  if (input.name !== undefined || input.email !== undefined) {
    validateContributorInput({
      name: input.name ?? "placeholder",
      email: input.email,
    });
  }

  const values: Record<string, unknown> = {};
  if (input.name !== undefined) values.name = input.name.trim();
  if (input.email !== undefined) values.email = input.email?.toLowerCase().trim() ?? null;
  if (input.externalRef !== undefined) values.externalRef = input.externalRef?.trim() || null;
  if (input.active !== undefined) values.active = input.active;
  if (input.password) values.passwordHash = await hashPassword(input.password);

  if (Object.keys(values).length === 0) return;

  try {
    const updated = await db
      .update(schema.contributors)
      .set(values)
      .where(
        and(
          eq(schema.contributors.id, contributorId),
          eq(schema.contributors.tenantId, tenantId)
        )
      )
      .returning({ id: schema.contributors.id });

    if (updated.length === 0) {
      throw new AdminValidationError("That person is not in this business");
    }
  } catch (error) {
    if (error instanceof AdminValidationError) throw error;
    throw translateUniqueViolation(error, input.externalRef ?? "");
  }
}

// ============================================================
// Business settings
// ============================================================

/**
 * The four settings that change how money is held, paid and clawed back.
 *
 * ⚠️ THESE ARE NOT ALL RETROACTIVE, AND THE DIFFERENCE MATTERS. Two of them are
 * read when a payout runs; the other is stamped onto each allocation as it is
 * created. That means:
 *
 * - **Minimum payout** and **clawback policy** take effect on the NEXT payout
 *   run, because `selectPayoutCandidates` and the reversal path read the tenant
 *   row at the time they run.
 * - **Hold days** is applied by `holdUntil(occurredAt, payoutHoldDays)` at
 *   allocation time and written to `available_at` on the ledger entry. Money
 *   already earned keeps the release date it was given. Shortening the window
 *   does NOT release held money early, and lengthening it does not claw back
 *   money already released.
 *
 * That asymmetry is deliberate — a release date somebody has already been shown
 * should not move under them — but it is surprising enough that the settings
 * screen says so on the field itself. Do not "fix" it by recomputing
 * `available_at` across existing entries; that rewrites what contributors were
 * already told.
 */
export interface TenantSettingsInput {
  /** Days between a sale and the money becoming withdrawable. */
  payoutHoldDays: number;
  /** Decimal string, e.g. "25.00". Parsed exactly — never through a float. */
  minimumPayout: string;
  clawbackPolicy: "recoup" | "absorb" | "reserve";
  /** Only meaningful under `reserve`. Whole percent, e.g. 10 for 10%. */
  reservePercent?: number | null;
  reserveReleaseDays?: number | null;
}

/** A calendar year of hold is already absurd; beyond it this is a typo, not a policy. */
const MAX_HOLD_DAYS = 365;

/** Exported for unit testing — pure, no database, no clock. */
export function validateSettingsInput(input: TenantSettingsInput): void {
  if (!Number.isInteger(input.payoutHoldDays)) {
    throw new AdminValidationError("The hold period must be a whole number of days");
  }
  if (input.payoutHoldDays < 0 || input.payoutHoldDays > MAX_HOLD_DAYS) {
    throw new AdminValidationError(
      `The hold period must be between 0 and ${MAX_HOLD_DAYS} days`
    );
  }

  if (!["recoup", "absorb", "reserve"].includes(input.clawbackPolicy)) {
    throw new AdminValidationError("That is not a recognised refund policy");
  }

  if (input.clawbackPolicy === "reserve") {
    const percent = input.reservePercent;
    if (percent === null || percent === undefined) {
      throw new AdminValidationError(
        "Holding a reserve needs a percentage to hold back"
      );
    }
    // Zero would silently make `reserve` behave as `recoup` — see
    // `reversal.ts:249`, which returns 0 when the rate is not positive. Reject
    // it so the policy on screen matches the policy in force.
    if (percent <= 0 || percent > 100) {
      throw new AdminValidationError(
        "The reserve percentage must be above 0 and no more than 100"
      );
    }
    if (Math.abs(Math.round(percent * 100) - percent * 100) > 1e-9) {
      throw new AdminValidationError(
        "The reserve percentage can have at most two decimal places"
      );
    }

    const releaseDays = input.reserveReleaseDays;
    if (releaseDays === null || releaseDays === undefined) {
      throw new AdminValidationError(
        "Holding a reserve needs to say how long it is held for"
      );
    }
    if (!Number.isInteger(releaseDays) || releaseDays < 0 || releaseDays > MAX_HOLD_DAYS) {
      throw new AdminValidationError(
        `The reserve period must be a whole number between 0 and ${MAX_HOLD_DAYS} days`
      );
    }
  }
}

export async function updateTenantSettings(
  db: EngineDb,
  tenantId: string,
  input: TenantSettingsInput,
  actorId?: string
): Promise<void> {
  validateSettingsInput(input);

  // Parsed with the engine's exact decimal reader, not `Number(...)`. This is a
  // money value arriving as text from a form field, which is precisely where a
  // float would round.
  let minimumPayoutMinor: bigint;
  try {
    minimumPayoutMinor = parseDecimalToMinor(input.minimumPayout);
  } catch {
    throw new AdminValidationError("The minimum payout must be an amount, like 25.00");
  }
  if (minimumPayoutMinor < 0n) {
    throw new AdminValidationError("The minimum payout cannot be negative");
  }

  const [before] = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId))
    .limit(1);

  if (!before) throw new AdminValidationError("That business no longer exists");

  // Reserve settings are left alone under the other policies rather than zeroed,
  // so switching to `reserve` and back does not lose the configuration.
  const values: Record<string, unknown> = {
    payoutHoldDays: input.payoutHoldDays,
    minimumPayoutMinor,
    clawbackPolicy: input.clawbackPolicy,
    updatedAt: new Date(),
  };

  if (input.clawbackPolicy === "reserve") {
    values.reserveBasisPoints = toBasisPoints(input.reservePercent!);
    values.reserveReleaseDays = input.reserveReleaseDays!;
  }

  await db.transaction(async (tx) => {
    await tx.update(schema.tenants).set(values).where(eq(schema.tenants.id, tenantId));

    await tx.insert(schema.auditLog).values({
      tenantId,
      actorType: "tenant_user",
      actorId: actorId ?? null,
      action: "update_settings",
      entityType: "tenant",
      entityId: tenantId,
      before: {
        payoutHoldDays: before.payoutHoldDays,
        minimumPayoutMinor: before.minimumPayoutMinor.toString(),
        clawbackPolicy: before.clawbackPolicy,
        reserveBasisPoints: before.reserveBasisPoints,
        reserveReleaseDays: before.reserveReleaseDays,
      },
      after: {
        payoutHoldDays: input.payoutHoldDays,
        minimumPayoutMinor: minimumPayoutMinor.toString(),
        clawbackPolicy: input.clawbackPolicy,
        reserveBasisPoints:
          input.clawbackPolicy === "reserve"
            ? toBasisPoints(input.reservePercent!)
            : before.reserveBasisPoints,
        reserveReleaseDays:
          input.clawbackPolicy === "reserve"
            ? input.reserveReleaseDays!
            : before.reserveReleaseDays,
      },
    });
  });
}

// ============================================================
// Works
// ============================================================

export interface WorkInput {
  title: string;
  externalRef?: string | null;
  productType?: string | null;
}

export async function createWork(
  db: EngineDb,
  tenantId: string,
  input: WorkInput
): Promise<string> {
  if (!input.title || input.title.trim().length === 0) {
    throw new AdminValidationError("A title is required");
  }

  try {
    const [row] = await db
      .insert(schema.works)
      .values({
        tenantId,
        title: input.title.trim(),
        externalRef: input.externalRef?.trim() || null,
        productType: input.productType?.trim() || null,
      })
      .returning({ id: schema.works.id });

    return row.id;
  } catch (error) {
    throw translateUniqueViolation(error, input.externalRef ?? "");
  }
}

export async function updateWork(
  db: EngineDb,
  tenantId: string,
  workId: string,
  input: Partial<WorkInput>
): Promise<void> {
  if (input.title !== undefined && input.title.trim().length === 0) {
    throw new AdminValidationError("A title is required");
  }

  const values: Record<string, unknown> = {};
  if (input.title !== undefined) values.title = input.title.trim();
  if (input.externalRef !== undefined) values.externalRef = input.externalRef?.trim() || null;
  if (input.productType !== undefined) values.productType = input.productType?.trim() || null;

  if (Object.keys(values).length === 0) return;

  try {
    const updated = await db
      .update(schema.works)
      .set(values)
      .where(and(eq(schema.works.id, workId), eq(schema.works.tenantId, tenantId)))
      .returning({ id: schema.works.id });

    if (updated.length === 0) {
      throw new AdminValidationError("That work is not in this business");
    }
  } catch (error) {
    if (error instanceof AdminValidationError) throw error;
    throw translateUniqueViolation(error, input.externalRef ?? "");
  }
}

/**
 * Retire a work without deleting it.
 *
 * Deleting would cascade to `work_contributors` and orphan the attribution
 * behind allocations that have already been paid — the history would still show
 * the payment but no longer be able to say what it was for. Archiving hides it
 * from the list and leaves every past sale explicable.
 *
 * Archiving does NOT stop a sale of it being attributed. A sale that arrives
 * for an archived work still pays whoever is on it, because the alternative is
 * silently dropping revenue that genuinely arrived.
 */
export async function setWorkArchived(
  db: EngineDb,
  tenantId: string,
  workId: string,
  archived: boolean
): Promise<void> {
  const updated = await db
    .update(schema.works)
    .set({ archivedAt: archived ? new Date() : null })
    .where(and(eq(schema.works.id, workId), eq(schema.works.tenantId, tenantId)))
    .returning({ id: schema.works.id });

  if (updated.length === 0) {
    throw new AdminValidationError("That work is not in this business");
  }
}

/**
 * Attach a contributor to a work, so a sale of it can pay them.
 *
 * ⚠️ BOTH IDS ARE CHECKED AGAINST THE TENANT, and that is not belt-and-braces.
 * The foreign keys on this table point at `works.id` and `contributors.id`
 * globally, so a request naming *another tenant's* contributor id satisfies
 * every database constraint and inserts happily — attaching a stranger to your
 * work, and putting them in line to be paid from your sales. The ids come
 * straight off an HTTP body, so this is the only thing standing between a
 * mistyped id and a cross-tenant payout.
 */
export async function linkWorkContributor(
  db: EngineDb,
  tenantId: string,
  workId: string,
  contributorId: string,
  role?: string | null
): Promise<void> {
  const [work] = await db
    .select({ id: schema.works.id })
    .from(schema.works)
    .where(and(eq(schema.works.id, workId), eq(schema.works.tenantId, tenantId)))
    .limit(1);

  if (!work) throw new AdminValidationError("That work is not in this business");

  const [contributor] = await db
    .select({ id: schema.contributors.id })
    .from(schema.contributors)
    .where(
      and(
        eq(schema.contributors.id, contributorId),
        eq(schema.contributors.tenantId, tenantId)
      )
    )
    .limit(1);

  if (!contributor) {
    throw new AdminValidationError("That person is not in this business");
  }

  try {
    await db.insert(schema.workContributors).values({
      tenantId,
      workId,
      contributorId,
      role: role ?? null,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AdminValidationError("That person is already on this work");
    }
    throw error;
  }
}

/**
 * Take someone off a work.
 *
 * Only affects sales from here on. Allocations already made snapshot their own
 * inputs, so removing somebody does not unpay them — which is correct: they
 * were owed that money under the arrangement that existed at the time.
 */
export async function unlinkWorkContributor(
  db: EngineDb,
  tenantId: string,
  workId: string,
  contributorId: string
): Promise<void> {
  const removed = await db
    .delete(schema.workContributors)
    .where(
      and(
        eq(schema.workContributors.tenantId, tenantId),
        eq(schema.workContributors.workId, workId),
        eq(schema.workContributors.contributorId, contributorId)
      )
    )
    .returning({ id: schema.workContributors.id });

  if (removed.length === 0) {
    throw new AdminValidationError("That person is not on this work");
  }
}

// ============================================================
// Shared
// ============================================================

const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth++) {
    if (
      typeof current === "object" &&
      (current as { code?: string }).code === UNIQUE_VIOLATION
    ) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Turn a database constraint error into something an owner can act on.
 *
 * Walks the `cause` chain because Drizzle wraps driver errors — the same trap
 * that once turned every replayed webhook into a 500.
 */
function translateUniqueViolation(error: unknown, ref: string): Error {
  if (isUniqueViolation(error)) {
    return new AdminValidationError(
      ref
        ? `Something else already uses the reference "${ref}". References must be unique.`
        : "That already exists."
    );
  }
  return error as Error;
}
