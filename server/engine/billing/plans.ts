/**
 * What we sell, and for how much.
 *
 * Settled with the user on 2026-08-01; full reasoning in blueprint §12. The
 * *model* is ratified. The *numbers* are placeholders until design-partner
 * conversations happen, and were agreed as such — treat changing a price as
 * routine and changing the shape as a decision.
 *
 * ────────────────────────────────────────────────────────────────────────
 * WHY THESE ARE CODE AND NOT DATABASE ROWS
 * ────────────────────────────────────────────────────────────────────────
 *
 * Plans are read on nearly every request and change perhaps twice a year. As
 * rows they would need a migration to add a tier, a cache to avoid the lookup,
 * and a story for what happens when someone edits a row that live subscriptions
 * point at. As code they are a constant, reviewable in a diff, and impossible to
 * change by accident in production.
 *
 * `engine_subscriptions.planKey` is deliberately NOT a foreign key to this. A
 * retired plan still has to describe the subscriptions that are on it — a
 * customer grandfathered onto an old price must keep working — so lookups
 * tolerate an unknown key rather than throwing.
 *
 * ────────────────────────────────────────────────────────────────────────
 * WHAT `peopleLimit` IS, AND WHAT IT IS NOT
 * ────────────────────────────────────────────────────────────────────────
 *
 * It is the number of DISTINCT PEOPLE PAID within a billing period. Not people
 * on the books — a gallery with 60 contributors who paid 8 this month is an
 * 8-person month (§12 rule 1).
 *
 * ⚠️ It is a GUIDE RAIL, NOT A METER, and not a gate:
 *
 *   - It never sets `planKey`. The customer chooses their plan; our count never
 *     moves them (§12 rule 2). A bill that floats with our own number is both
 *     the unpredictability that killed per-payout pricing and an invitation to
 *     argue about the count.
 *   - It never blocks a payout, and never blocks adding a person (§12 rule 3).
 *     Blocking a payout harms the CONTRIBUTOR, who is not our customer and
 *     cannot fix it, on payout day, which is the one day this must not fail.
 *
 * Exceeding it produces a notice and, at renewal, a prompt to move up. Nothing
 * else. If you are writing code that returns `false` from a limit check and
 * stops something happening, re-read §12 rule 3 first.
 */

export interface Plan {
  key: string;
  name: string;
  /** Minor units, in USD. Money is never a float, including prices. */
  priceMinor: bigint;
  currency: string;
  /** Distinct people paid per billing period before an upgrade is suggested. */
  peopleLimit: number;
  /** Shown on the pricing screen, in the owner's language rather than ours. */
  blurb: string;
  /** Hidden from signup but still valid for existing subscribers. */
  retired?: boolean;
}

export const TRIAL_DAYS = 14;

/**
 * No free tier — ratified decision #5.
 *
 * No sub-$49 tier either, considered and deferred rather than forgotten: under
 * about five contributors the manual job is twenty minutes, not five hours, and
 * that is not enough pain to sustain a subscription. Kept open because the
 * asymmetry favours waiting — adding a cheaper plan later reads as generous,
 * removing one reads as a price rise.
 *
 * No event caps. A second limit makes "am I over?" unanswerable without support.
 */
export const PLANS: Plan[] = [
  {
    key: "starter",
    name: "Starter",
    priceMinor: 4900n,
    currency: "USD",
    peopleLimit: 10,
    blurb: "For a small roster. Up to 10 people paid each month.",
  },
  {
    key: "growth",
    name: "Growth",
    priceMinor: 9900n,
    currency: "USD",
    peopleLimit: 50,
    blurb: "For a growing catalogue. Up to 50 people paid each month.",
  },
  {
    key: "scale",
    name: "Scale",
    priceMinor: 19900n,
    currency: "USD",
    peopleLimit: 200,
    blurb: "For an established operation. Up to 200 people paid each month.",
  },
];

export const DEFAULT_PLAN_KEY = "starter";

/** Tolerates an unknown key on purpose — see the header. */
export function findPlan(planKey: string): Plan | null {
  return PLANS.find((plan) => plan.key === planKey) ?? null;
}

/** Plans a new or upgrading customer may choose. */
export function selectablePlans(): Plan[] {
  return PLANS.filter((plan) => !plan.retired);
}

/**
 * The smallest plan that covers this many people.
 *
 * Used ONLY to suggest an upgrade — never to apply one. Returns null above the
 * largest plan, which is a "talk to us" conversation rather than an automatic
 * anything.
 */
export function smallestPlanFor(peopleCount: number): Plan | null {
  return (
    selectablePlans()
      .slice()
      .sort((a, b) => a.peopleLimit - b.peopleLimit)
      .find((plan) => plan.peopleLimit >= peopleCount) ?? null
  );
}
