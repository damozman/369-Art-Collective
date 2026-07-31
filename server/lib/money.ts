/**
 * Money — integer minor units only.
 *
 * Every amount in the payout path is an integer number of minor units (cents for
 * USD) paired with an ISO-4217 currency code. Floats are never used to hold or
 * carry a money value; they appear only as an input format when parsing legacy
 * `decimal` columns and Shopify's string prices.
 *
 * Rounding is half-away-from-zero everywhere, so that a rate applied to a debit
 * rounds the same way as the same rate applied to a credit. `Math.round` is
 * half-toward-positive-infinity and therefore asymmetric across zero, which is
 * why it is not used directly.
 */

export interface Money {
  amountMinor: number;
  currency: string;
}

export function money(amountMinor: number, currency: string): Money {
  if (!Number.isInteger(amountMinor)) {
    throw new Error(`Money must be an integer number of minor units, got ${amountMinor}`);
  }
  return { amountMinor, currency };
}

/** Round half-away-from-zero. */
export function roundHalfAwayFromZero(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/**
 * Parse a decimal money string ("24.99") into minor units.
 *
 * Used at the two edges where money arrives as text: Shopify webhook payloads
 * and the legacy `decimal` columns. Nothing downstream of the edge should call
 * this — it exists to get values *into* minor units once.
 *
 * The digits are read from the string rather than routed through `parseFloat`.
 * That is not fussiness: `parseFloat("1.005") * 100` is 100.49999999999999, so
 * the float path rounds a value whose exact third digit is 5 *down*, and does
 * it inconsistently depending on the input. A money parser that loses a cent
 * some of the time is worse than one that loses it always, because the bug is
 * unreproducible.
 */
export function parseDecimalToMinor(value: string | number, currency = "USD"): number {
  const text = typeof value === "number" ? String(value) : value.trim();

  const match = text.match(/^([+-])?(\d*)(?:\.(\d*))?$/);
  if (!match || (match[2] === "" && (match[3] ?? "") === "")) {
    throw new Error(`Cannot parse "${value}" as a ${currency} amount`);
  }

  const sign = match[1] === "-" ? -1 : 1;
  const whole = match[2] === "" ? 0 : Number(match[2]);
  const fractionDigits = match[3] ?? "";

  const cents = Number((fractionDigits + "00").slice(0, 2));
  // Round on the third digit, half away from zero.
  const carry = Number(fractionDigits[2] ?? "0") >= 5 ? 1 : 0;

  return sign * (whole * 100 + cents + carry);
}

/** Format minor units as a plain decimal string, for legacy `decimal` columns. */
export function formatMinorToDecimal(amountMinor: number): string {
  const sign = amountMinor < 0 ? "-" : "";
  const abs = Math.abs(amountMinor);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/**
 * Apply a percentage rate to a minor-unit amount.
 *
 * The rate is converted to basis points first so that a rate like 2.9 is held
 * exactly as 290 rather than as a binary float, keeping the multiplication
 * integer-exact for any amount this system will ever see.
 */
export function applyRate(amountMinor: number, ratePercent: number): number {
  const rateBasisPoints = roundHalfAwayFromZero(ratePercent * 100);
  return roundHalfAwayFromZero((amountMinor * rateBasisPoints) / 10000);
}

/**
 * Split a total across weighted buckets so the parts sum to exactly the total.
 *
 * Largest-remainder apportionment: floor every share, then hand the leftover
 * minor units one at a time to the buckets with the largest discarded fraction.
 * Used to spread an order-level fixed fee (Stripe's per-transaction 30¢) across
 * the line items of that order without inventing or losing a cent.
 *
 * A zero total weight splits the total as evenly as possible instead of dividing
 * by zero — a zero-value order still owes the fixed fee.
 */
export function allocate(totalMinor: number, weights: number[]): number[] {
  if (weights.length === 0) return [];

  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const shares =
    totalWeight === 0
      ? weights.map(() => totalMinor / weights.length)
      : weights.map((w) => (totalMinor * w) / totalWeight);

  const floored = shares.map((s) => Math.floor(s));
  let remainder = totalMinor - floored.reduce((sum, f) => sum + f, 0);

  const byLargestFraction = shares
    .map((share, index) => ({ index, fraction: share - Math.floor(share) }))
    .sort((a, b) => b.fraction - a.fraction);

  const result = [...floored];
  for (let i = 0; remainder > 0; i = (i + 1) % byLargestFraction.length) {
    result[byLargestFraction[i].index] += 1;
    remainder -= 1;
  }
  return result;
}

/** Assert every amount in a calculation shares one currency. */
export function assertSameCurrency(currencies: string[], context: string): string {
  const distinct = Array.from(new Set(currencies));
  if (distinct.length !== 1) {
    throw new Error(`${context}: mixed currencies ${distinct.join(", ")}`);
  }
  return distinct[0];
}
