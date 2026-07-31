/**
 * Engine money — bigint minor units.
 *
 * Separate from `server/lib/money.ts`, deliberately. That module serves the
 * marketplace, whose columns are `integer` minor units and whose amounts are
 * JS numbers. The engine holds other people's money across many tenants, so its
 * columns are `bigint` and its arithmetic is `bigint` end to end — no value in
 * this file is ever a `number` that represents money.
 *
 * The two coexist only until Phase 2 migrates 369 onto the engine, at which
 * point `lib/money.ts` goes away with the marketplace tables.
 *
 * RATES ARE BASIS POINTS, ALWAYS. A percentage is never stored or passed as a
 * float: 30% is `3000`, 2.9% is `290`. There is no representable-in-binary
 * question to get wrong, and `bigint` arithmetic on basis points is exact.
 */

/** Round `numerator / denominator` half-away-from-zero, in exact integer math. */
export function roundedDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) {
    throw new Error("Division by zero in money arithmetic");
  }

  const negative = numerator < 0n !== denominator < 0n;
  const absNumerator = numerator < 0n ? -numerator : numerator;
  const absDenominator = denominator < 0n ? -denominator : denominator;

  const quotient = absNumerator / absDenominator;
  const remainder = absNumerator % absDenominator;

  // Half-away-from-zero: round up when the remainder is at least half.
  const rounded = remainder * 2n >= absDenominator ? quotient + 1n : quotient;

  return negative ? -rounded : rounded;
}

/**
 * Apply a basis-point rate to a minor-unit amount.
 *
 * Symmetric across zero, which matters because the same rate is applied to
 * reversals as to sales: a 30% allocation of −$99.00 must be exactly the
 * negation of 30% of $99.00, or reversing a sale leaves a residue behind.
 */
export function applyBasisPoints(amountMinor: bigint, basisPoints: number): bigint {
  if (!Number.isInteger(basisPoints)) {
    throw new Error(`Basis points must be an integer, got ${basisPoints}`);
  }
  return roundedDiv(amountMinor * BigInt(basisPoints), 10000n);
}

/** Convert a percentage to basis points. Accepts 2.9 → 290. */
export function percentToBasisPoints(percent: number): number {
  const basisPoints = Math.round(percent * 100);
  if (Math.abs(basisPoints - percent * 100) > 1e-9) {
    throw new Error(`Percent ${percent} is finer than basis-point precision`);
  }
  return basisPoints;
}

/**
 * Parse a decimal money string into minor units, exactly.
 *
 * Digits are read from the string rather than routed through `parseFloat` — see
 * the same reasoning in `lib/money.ts`. `parseFloat("1.005") * 100` is
 * 100.49999999999999, so the float path loses a cent unpredictably.
 */
export function parseDecimalToMinor(value: string | number, currency = "USD"): bigint {
  const text = typeof value === "number" ? String(value) : value.trim();

  const match = text.match(/^([+-])?(\d*)(?:\.(\d*))?$/);
  if (!match || (match[2] === "" && (match[3] ?? "") === "")) {
    throw new Error(`Cannot parse "${value}" as a ${currency} amount`);
  }

  const sign = match[1] === "-" ? -1n : 1n;
  const whole = match[2] === "" ? 0n : BigInt(match[2]);
  const fractionDigits = match[3] ?? "";

  const cents = BigInt((fractionDigits + "00").slice(0, 2));
  const carry = Number(fractionDigits[2] ?? "0") >= 5 ? 1n : 0n;

  return sign * (whole * 100n + cents + carry);
}

/** Format minor units as a plain decimal string. */
export function formatMinor(amountMinor: bigint): string {
  const negative = amountMinor < 0n;
  const abs = negative ? -amountMinor : amountMinor;
  const whole = abs / 100n;
  const cents = abs % 100n;
  return `${negative ? "-" : ""}${whole}.${cents.toString().padStart(2, "0")}`;
}

/** Format for display, e.g. `$21.86`. USD-only in Phase 1 (ratified decision #6). */
export function formatMoney(amountMinor: bigint, currency = "USD"): string {
  const symbol = currency === "USD" ? "$" : "";
  const negative = amountMinor < 0n;
  const body = formatMinor(negative ? -amountMinor : amountMinor);
  return `${negative ? "-" : ""}${symbol}${body}`;
}

/**
 * Split a total across weighted buckets so the parts sum to exactly the total.
 *
 * Largest-remainder apportionment in exact integer math: floor every share, then
 * distribute the leftover minor units to the buckets with the largest discarded
 * fraction. Used wherever an event-level amount must be spread across several
 * contributors or lines without inventing or losing a unit.
 *
 * Handles negative totals (reversals) by allocating the magnitude and flipping
 * the signs back, so reversing an apportioned amount returns exactly the parts
 * that were originally handed out.
 */
export function allocate(totalMinor: bigint, weights: bigint[]): bigint[] {
  if (weights.length === 0) return [];

  if (totalMinor < 0n) {
    return allocate(-totalMinor, weights).map((part) => -part);
  }

  const totalWeight = weights.reduce((sum, w) => sum + w, 0n);

  // A zero total weight splits as evenly as possible rather than dividing by
  // zero — a zero-value event can still carry a fixed fee that must land
  // somewhere.
  const numerators =
    totalWeight === 0n
      ? weights.map(() => totalMinor)
      : weights.map((w) => totalMinor * w);
  const denominator = totalWeight === 0n ? BigInt(weights.length) : totalWeight;

  const floored = numerators.map((n) => n / denominator);
  const remainders = numerators.map((n) => n % denominator);

  let leftover = totalMinor - floored.reduce((sum, f) => sum + f, 0n);

  const byLargestRemainder = remainders
    .map((remainder, index) => ({ index, remainder }))
    .sort((a, b) => (b.remainder > a.remainder ? 1 : b.remainder < a.remainder ? -1 : 0));

  const result = [...floored];
  for (let i = 0; leftover > 0n; i = (i + 1) % byLargestRemainder.length) {
    result[byLargestRemainder[i].index] += 1n;
    leftover -= 1n;
  }

  return result;
}

/** Assert every amount in a calculation shares one currency. */
export function assertSameCurrency(currencies: string[], context: string): string {
  const distinct = Array.from(new Set(currencies));
  if (distinct.length === 0) {
    throw new Error(`${context}: no currency given`);
  }
  if (distinct.length !== 1) {
    throw new Error(`${context}: mixed currencies ${distinct.join(", ")}`);
  }
  return distinct[0];
}

export function sumMinor(amounts: bigint[]): bigint {
  return amounts.reduce((total, amount) => total + amount, 0n);
}
