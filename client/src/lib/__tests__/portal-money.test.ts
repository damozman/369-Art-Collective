/**
 * The portal's money formatting.
 *
 * Small surface, but it is the one place in the UI where getting it wrong loses
 * or invents money on screen, so it is tested rather than eyeballed. The
 * headline case is the one at the bottom: an amount above 2^53 that `Number`
 * would silently round. That test is the guard on the whole "strings, never
 * numbers" rule — if someone later "simplifies" this module with `Number(...)`,
 * this is what fails.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  formatMinor,
  formatMoney,
  isPositive,
  isZero,
  signOf,
  toMinor,
} from "../portal-money";

test("formats whole and fractional amounts", () => {
  assert.equal(formatMinor("2186"), "21.86");
  assert.equal(formatMinor("100"), "1.00");
  assert.equal(formatMinor("5"), "0.05");
  assert.equal(formatMinor("0"), "0.00");
});

test("pads cents rather than truncating them", () => {
  // "8.5" instead of "8.05" is the classic off-by-a-factor-of-ten display bug.
  assert.equal(formatMinor("805"), "8.05");
  assert.equal(formatMinor("850"), "8.50");
});

test("negative amounts keep the sign outside the currency symbol", () => {
  assert.equal(formatMinor("-2186"), "-21.86");
  assert.equal(formatMoney("-2186"), "-$21.86");
  assert.equal(formatMoney("2186"), "$21.86");
});

test("an unknown currency renders without inventing a symbol", () => {
  assert.equal(formatMoney("2186", "EUR"), "21.86");
});

test("missing amounts read as zero rather than NaN", () => {
  // A null `availableAt`-style field or an absent trace amount must not put
  // "NaN" in front of a contributor.
  assert.equal(formatMinor(null), "0.00");
  assert.equal(formatMinor(undefined), "0.00");
  assert.equal(formatMinor(""), "0.00");
  assert.equal(formatMoney(null), "$0.00");
});

test("sign helpers never coerce to number", () => {
  assert.equal(signOf("1"), 1);
  assert.equal(signOf("-1"), -1);
  assert.equal(signOf("0"), 0);
  assert.equal(isPositive("2186"), true);
  assert.equal(isPositive("-2186"), false);
  assert.equal(isZero("0"), true);
});

test("parses exactly at and beyond the float-safe integer range", () => {
  // 2^53 + 1 minor units. `Number("9007199254740993")` is 9007199254740992 —
  // one unit lost, silently. BigInt keeps it.
  const beyondFloat = "9007199254740993";
  assert.equal(toMinor(beyondFloat), 9007199254740993n);
  assert.equal(formatMinor(beyondFloat), "90071992547409.93");
  assert.equal(formatMoney(beyondFloat), "$90071992547409.93");

  // Demonstrate the failure being guarded against, so the reason this test
  // exists survives future readers.
  assert.notEqual(Number(beyondFloat).toString(), beyondFloat);
});

test("very large negative amounts survive the round trip too", () => {
  assert.equal(formatMoney("-9007199254740993"), "-$90071992547409.93");
});
