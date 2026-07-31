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

/** Attach a contributor to a work, so a sale of it can pay them. */
export async function linkWorkContributor(
  db: EngineDb,
  tenantId: string,
  workId: string,
  contributorId: string,
  role?: string | null
): Promise<void> {
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
