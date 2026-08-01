import test from "node:test";
import assert from "node:assert/strict";

import {
  allocate,
  applyBasisPoints,
  assertSameCurrency,
  formatMinor,
  formatMoney,
  groupDigits,
  parseDecimalToMinor,
  percentToBasisPoints,
  roundedDiv,
  sumMinor,
} from "../money";

test("roundedDiv rounds half away from zero, symmetrically", () => {
  assert.equal(roundedDiv(5n, 2n), 3n); // 2.5 -> 3
  assert.equal(roundedDiv(-5n, 2n), -3n); // -2.5 -> -3
  assert.equal(roundedDiv(7n, 2n), 4n); // 3.5 -> 4
  assert.equal(roundedDiv(-7n, 2n), -4n);
  assert.equal(roundedDiv(4n, 2n), 2n);
  assert.equal(roundedDiv(1n, 3n), 0n);
});

test("roundedDiv refuses to divide by zero", () => {
  assert.throws(() => roundedDiv(1n, 0n), /Division by zero/);
});

test("applyBasisPoints is exact for rates that are not binary-representable", () => {
  // 2.9% of $100.00
  assert.equal(applyBasisPoints(10000n, 290), 290n);
  // 30% of $19.00
  assert.equal(applyBasisPoints(1900n, 3000), 570n);
  // 30% of 782 = 234.6 -> 235
  assert.equal(applyBasisPoints(782n, 3000), 235n);
});

test("applyBasisPoints negates exactly — a full reversal leaves no residue", () => {
  // This is the property that makes refunds clean. If rounding were asymmetric
  // across zero, reversing a sale would leave a stray cent on the ledger.
  for (const amount of [782n, 1900n, 9900n, 24900n, 1n, 3n, 7n, 12345n]) {
    for (const rate of [3000, 3500, 4000, 4500, 290, 1]) {
      assert.equal(
        applyBasisPoints(-amount, rate),
        -applyBasisPoints(amount, rate),
        `rate ${rate} on ${amount} is not symmetric`
      );
    }
  }
});

test("percentToBasisPoints converts and rejects finer precision", () => {
  assert.equal(percentToBasisPoints(30), 3000);
  assert.equal(percentToBasisPoints(2.9), 290);
  assert.equal(percentToBasisPoints(33.33), 3333);
  assert.throws(() => percentToBasisPoints(33.333), /finer than basis-point/);
});

test("parseDecimalToMinor is string-exact where float parsing is not", () => {
  assert.equal(parseDecimalToMinor("24.99"), 2499n);
  assert.equal(parseDecimalToMinor("0.01"), 1n);
  assert.equal(parseDecimalToMinor("100"), 10000n);
  assert.equal(parseDecimalToMinor("-2.50"), -250n);
  // parseFloat("1.005") * 100 === 100.49999999999999
  assert.equal(parseDecimalToMinor("1.005"), 101n);
});

test("parseDecimalToMinor handles amounts beyond Number.MAX_SAFE_INTEGER cents", () => {
  // $10 trillion. An `integer` column and a JS number both lose this; bigint does not.
  assert.equal(parseDecimalToMinor("10000000000000.01"), 1000000000000001n);
});

test("parseDecimalToMinor rejects garbage rather than coercing it", () => {
  assert.throws(() => parseDecimalToMinor("abc"), /Cannot parse/);
  assert.throws(() => parseDecimalToMinor(""), /Cannot parse/);
  assert.throws(() => parseDecimalToMinor("1.2.3"), /Cannot parse/);
});

test("formatMinor and formatMoney round-trip", () => {
  assert.equal(formatMinor(2499n), "24.99");
  assert.equal(formatMinor(5n), "0.05");
  assert.equal(formatMinor(0n), "0.00");
  assert.equal(formatMinor(-250n), "-2.50");
  assert.equal(formatMoney(2186n), "$21.86");
  assert.equal(formatMoney(-2186n), "-$21.86");
});

test("allocate distributes exactly, inventing and losing nothing", () => {
  const parts = allocate(100n, [1n, 1n, 1n]);
  assert.deepEqual(parts, [34n, 33n, 33n]);
  assert.equal(sumMinor(parts), 100n);
});

test("allocate weights by share and still sums to the total", () => {
  const weights = [1900n, 9900n];
  const parts = allocate(372n, weights);
  assert.equal(sumMinor(parts), 372n);
  assert.deepEqual(parts, [60n, 312n]);
});

test("allocate handles negative totals so reversing an apportionment is exact", () => {
  const weights = [1900n, 9900n, 2900n];
  const forward = allocate(631n, weights);
  const backward = allocate(-631n, weights);

  assert.equal(sumMinor(forward), 631n);
  assert.equal(sumMinor(backward), -631n);
  assert.deepEqual(
    backward,
    forward.map((p) => -p),
    "reversing an allocation must return exactly the parts handed out"
  );
});

test("allocate handles zero total weight without dividing by zero", () => {
  const parts = allocate(30n, [0n, 0n]);
  assert.deepEqual(parts, [15n, 15n]);
  assert.equal(sumMinor(parts), 30n);
});

test("allocate on an empty bucket list returns nothing", () => {
  assert.deepEqual(allocate(100n, []), []);
});

test("assertSameCurrency catches mixed currencies", () => {
  assert.equal(assertSameCurrency(["USD", "USD"], "ctx"), "USD");
  assert.throws(() => assertSameCurrency(["USD", "EUR"], "ctx"), /mixed currencies/);
  assert.throws(() => assertSameCurrency([], "ctx"), /no currency/);
});

// ============================================================
// Thousands grouping
// ============================================================

test("thousands are grouped so large amounts can be scanned", () => {
  assert.equal(formatMoney(6440000n), "$64,400.00");
  assert.equal(formatMoney(199000n), "$1,990.00");
  assert.equal(formatMoney(100000000n), "$1,000,000.00");
});

test("small amounts are unchanged by grouping", () => {
  assert.equal(formatMoney(2186n), "$21.86");
  assert.equal(formatMoney(0n), "$0.00");
  assert.equal(formatMoney(99n), "$0.99");
});

test("the sign still sits outside the symbol", () => {
  assert.equal(formatMoney(-6440000n), "-$64,400.00");
});

/**
 * The grouping must not go anywhere near a float. A total beyond 2^53 is the
 * exact case bigint columns exist for, and `toLocaleString()` at the final step
 * would have silently corrupted it.
 */
test("grouping survives past the float limit", () => {
  assert.equal(formatMoney(900719925474099300n), "$9,007,199,254,740,993.00");
});

test("formatMinor stays ungrouped — it is the machine-readable form", () => {
  // It crosses the wire in JSON; a comma there would need stripping everywhere.
  assert.equal(formatMinor(6440000n), "64400.00");
});

test("grouping boundaries are right at every length", () => {
  assert.equal(groupDigits("1"), "1");
  assert.equal(groupDigits("12"), "12");
  assert.equal(groupDigits("123"), "123");
  assert.equal(groupDigits("1234"), "1,234");
  assert.equal(groupDigits("12345"), "12,345");
  assert.equal(groupDigits("123456"), "123,456");
  assert.equal(groupDigits("1234567"), "1,234,567");
});
