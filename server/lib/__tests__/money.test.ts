import test from "node:test";
import assert from "node:assert/strict";

import {
  allocate,
  applyRate,
  formatMinorToDecimal,
  parseDecimalToMinor,
  roundHalfAwayFromZero,
} from "../money";

test("parses decimal strings into exact minor units", () => {
  assert.equal(parseDecimalToMinor("24.99"), 2499);
  assert.equal(parseDecimalToMinor("0.01"), 1);
  assert.equal(parseDecimalToMinor("100"), 10000);
  // 1.005 in binary float is 1.00499999... — the naive `x * 100` truncation
  // path gets this wrong, which is how cents go missing.
  assert.equal(parseDecimalToMinor("1.005"), 101);
});

test("formats minor units back to decimal strings", () => {
  assert.equal(formatMinorToDecimal(2499), "24.99");
  assert.equal(formatMinorToDecimal(5), "0.05");
  assert.equal(formatMinorToDecimal(0), "0.00");
  assert.equal(formatMinorToDecimal(-250), "-2.50");
});

test("rounds half away from zero, symmetrically across zero", () => {
  assert.equal(roundHalfAwayFromZero(0.5), 1);
  assert.equal(roundHalfAwayFromZero(-0.5), -1);
  assert.equal(roundHalfAwayFromZero(1.5), 2);
  assert.equal(roundHalfAwayFromZero(-1.5), -2);
});

test("applies rates without float drift", () => {
  // 2.9% of $24.99 = 72.471c -> 72c
  assert.equal(applyRate(2499, 2.9), 72);
  // 30% of $19.00
  assert.equal(applyRate(1900, 30), 570);
  // A rate that is not representable in binary floating point
  assert.equal(applyRate(10000, 2.9), 290);
});

test("allocate distributes a total exactly, losing and inventing nothing", () => {
  const parts = allocate(100, [1, 1, 1]);
  assert.deepEqual(parts, [34, 33, 33]);
  assert.equal(
    parts.reduce((a, b) => a + b, 0),
    100
  );
});

test("allocate weights by share and still sums to the total", () => {
  const weights = [2499, 5900, 1900];
  const total = 331; // a plausible order processing fee
  const parts = allocate(total, weights);
  assert.equal(
    parts.reduce((a, b) => a + b, 0),
    total
  );
  // Largest weight takes the largest share.
  assert.ok(parts[1] > parts[0] && parts[0] > parts[2]);
});

test("allocate handles zero total weight without dividing by zero", () => {
  const parts = allocate(30, [0, 0]);
  assert.deepEqual(parts, [15, 15]);
});

test("allocate on a single bucket gives it everything", () => {
  assert.deepEqual(allocate(331, [2499]), [331]);
});
