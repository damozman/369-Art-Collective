/**
 * Money formatting for the contributor portal.
 *
 * EVERY AMOUNT THAT CROSSES THE WIRE IS A STRING, and stays one here.
 *
 * The engine stores amounts as bigint minor units. `JSON.stringify` cannot
 * serialise a bigint at all, so the API sends `{ minor: "2186" }` — and the
 * moment a client does `Number(minor)` it reintroduces exactly the failure the
 * bigint columns exist to prevent: silent rounding above 2^53. A tenant paying
 * out in a minor-unit-heavy currency, or any sufficiently large lifetime total,
 * would then display a number that is quietly wrong.
 *
 * So: parse with `BigInt`, never `Number`; format by integer division. There is
 * no float anywhere in this file, and there must never be one.
 *
 * This mirrors `server/engine/money.ts` `formatMinor` / `formatMoney` exactly —
 * deliberately, so the same amount reads identically in a statement email and
 * on screen. It is formatting, not recomputation: the *numbers* are always the
 * server's, this only decides where the decimal point and the symbol go.
 *
 * No React imports here on purpose — it keeps the module testable under plain
 * `tsx --test` alongside the server suites.
 */

/** How the API serialises an amount everywhere except `/me`. */
export interface Money {
  minor: string;
  formatted: string;
}

/** Parse a minor-unit string exactly. Missing/blank reads as zero. */
export function toMinor(minor: string | null | undefined): bigint {
  if (minor === null || minor === undefined || minor === "") return 0n;
  return BigInt(minor);
}

/**
 * Format minor units as a plain decimal string: `2186` → `21.86`.
 * Mirrors `formatMinor` on the server, sign included.
 */
export function formatMinor(minor: string | null | undefined): string {
  const value = toMinor(minor);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / 100n;
  const cents = abs % 100n;
  return `${negative ? "-" : ""}${whole}.${cents.toString().padStart(2, "0")}`;
}

/**
 * Format for display: `2186` → `$21.86`, `-2186` → `-$21.86`.
 *
 * Note the sign sits OUTSIDE the currency symbol, matching the server's
 * `formatMoney`. Formatting the server's `formatted` field with a symbol
 * bolted on the front would render `$-21.86`, which is why this reformats
 * from `minor` rather than decorating `formatted`.
 *
 * USD-only in Phase 1 (ratified decision #6); an unknown currency falls back
 * to no symbol rather than guessing one.
 */
export function formatMoney(minor: string | null | undefined, currency = "USD"): string {
  const value = toMinor(minor);
  const negative = value < 0n;
  const symbol = currency === "USD" ? "$" : "";
  const body = formatMinor((negative ? -value : value).toString());
  return `${negative ? "-" : ""}${symbol}${body}`;
}

/** Sign of an amount, without ever making it a number. */
export function signOf(minor: string | null | undefined): -1 | 0 | 1 {
  const value = toMinor(minor);
  if (value > 0n) return 1;
  if (value < 0n) return -1;
  return 0;
}

export function isPositive(minor: string | null | undefined): boolean {
  return signOf(minor) === 1;
}

export function isZero(minor: string | null | undefined): boolean {
  return signOf(minor) === 0;
}
