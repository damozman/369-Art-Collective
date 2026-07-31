import test from "node:test";
import assert from "node:assert/strict";

import { royaltyPercentForMonthlySales } from "../../../shared/financial-utils";
import {
  allocateProcessingFee,
  calculateNet,
  calculateProcessingFee,
  calculateRoyalty,
} from "../royalty";

const USD = "USD";

test("tier ladder is keyed on monthly sales amount, including the 40% rung", () => {
  assert.equal(royaltyPercentForMonthlySales(0), 30);
  assert.equal(royaltyPercentForMonthlySales(99_999), 30); // $999.99
  assert.equal(royaltyPercentForMonthlySales(100_000), 35); // $1,000
  assert.equal(royaltyPercentForMonthlySales(499_999), 35);
  assert.equal(royaltyPercentForMonthlySales(500_000), 40); // $5,000
  assert.equal(royaltyPercentForMonthlySales(999_999), 40);
  assert.equal(royaltyPercentForMonthlySales(1_000_000), 45); // $10,000
  assert.equal(royaltyPercentForMonthlySales(50_000_000), 45);
});

test("processing fee is 2.9% + 30c, charged once per order", () => {
  // $19.00 order
  assert.equal(calculateProcessingFee(1900), 55 + 30);
  // $0 order costs nothing
  assert.equal(calculateProcessingFee(0), 0);
});

test("processing fee is apportioned across lines, summing exactly to the fee", () => {
  const lineGross = [1900, 5900, 2900];
  const fee = calculateProcessingFee(lineGross.reduce((a, b) => a + b, 0));
  const shares = allocateProcessingFee(lineGross, fee);

  assert.equal(shares.reduce((a, b) => a + b, 0), fee);

  // Charging the fee per line instead would apply the fixed 30c once per line
  // rather than once per transaction, over-charging by 2 x 30c on a 3-line
  // order — money that would have come straight out of contributor royalties.
  const perLineTotal = lineGross.reduce((sum, g) => sum + calculateProcessingFee(g), 0);
  assert.equal(perLineTotal - fee, 60);
});

test("net subtracts production, shipping AND processing fees", () => {
  const net = calculateNet({
    grossMinor: 1900, // $19.00 paper 8x10, from config/pricing_matrix.json
    productionMinor: 404,
    shippingMinor: 629,
    processingFeeMinor: 85,
    currency: USD,
  });
  // 1900 - 404 - 629 - 85
  assert.equal(net, 782);
});

test("royalty is a percentage of net, not of retail", () => {
  const result = calculateRoyalty(
    {
      grossMinor: 1900,
      productionMinor: 404,
      shippingMinor: 629,
      processingFeeMinor: 85,
      currency: USD,
    },
    0 // bottom tier -> 30%
  );

  assert.equal(result.netMinor, 782);
  assert.equal(result.royaltyTierPercent, 30);
  assert.equal(result.baseRoyaltyMinor, 235); // 30% of 782 = 234.6 -> 235
  assert.equal(result.referralBonusMinor, 0);
  assert.equal(result.totalEarningsMinor, 235);

  // The retail-basis definition that used to live in shared/financial-utils
  // would have paid 30% of $19.00 = $5.70 — more than twice the entire net.
  assert.ok(result.totalEarningsMinor < 1900 * 0.3);
});

test("referral bonus adds 5% of net on top of the tier rate", () => {
  const line = {
    grossMinor: 5900,
    productionMinor: 1200,
    shippingMinor: 750,
    processingFeeMinor: 201,
    currency: USD,
  };
  const withoutBonus = calculateRoyalty(line, 0, false);
  const withBonus = calculateRoyalty(line, 0, true);

  assert.equal(withBonus.referralBonusMinor, Math.round(withoutBonus.netMinor * 0.05));
  assert.equal(
    withBonus.totalEarningsMinor,
    withoutBonus.baseRoyaltyMinor + withBonus.referralBonusMinor
  );
});

test("a loss-making line pays zero rather than going negative", () => {
  const result = calculateRoyalty(
    {
      grossMinor: 1900,
      productionMinor: 2500, // metal costs more than a paper sale brought in
      shippingMinor: 850,
      processingFeeMinor: 85,
      currency: USD,
    },
    0
  );

  assert.ok(result.netMinor < 0, "the loss is still recorded");
  assert.equal(result.baseRoyaltyMinor, 0, "but nothing is clawed back");
  assert.equal(result.totalEarningsMinor, 0);
});

test("the old hardcoded placeholders underpaid cheap items by roughly 3x", () => {
  // A $19.00 paper print. Real costs: $4.04 production, $6.29 shipping.
  const real = calculateRoyalty(
    {
      grossMinor: 1900,
      productionMinor: 404,
      shippingMinor: 629,
      processingFeeMinor: 85,
      currency: USD,
    },
    0
  );

  // What order-processor.ts used to assume: $15.00 production, $5.00 shipping,
  // no processing fee at all.
  const placeholderNet = 1900 - 1500 - 500;
  const placeholderRoyalty = Math.max(Math.round(placeholderNet * 0.3), 0);

  assert.equal(placeholderRoyalty, 0, "the fake costs made this sale look loss-making");
  assert.equal(real.totalEarningsMinor, 235);
  // The artist was owed $2.35 and would have been paid nothing.
  assert.ok(real.totalEarningsMinor > placeholderRoyalty);
});

test("the old placeholders overpaid expensive items", () => {
  // A $249.00 metal 24x36. Real costs: $45.00 production, $10.00 shipping.
  const real = calculateRoyalty(
    {
      grossMinor: 24900,
      productionMinor: 4500,
      shippingMinor: 1000,
      processingFeeMinor: 752,
      currency: USD,
    },
    0
  );

  const placeholderNet = 24900 - 1500 - 500;
  const placeholderRoyalty = Math.round(placeholderNet * 0.3);

  assert.equal(real.netMinor, 18648);
  assert.equal(real.baseRoyaltyMinor, 5594);
  assert.ok(
    placeholderRoyalty > real.baseRoyaltyMinor,
    "assuming a $15 cost on a $45 item inflated the payout"
  );
});

test("currency is carried through the calculation", () => {
  const result = calculateRoyalty(
    {
      grossMinor: 1900,
      productionMinor: 404,
      shippingMinor: 629,
      processingFeeMinor: 85,
      currency: "USD",
    },
    0
  );
  assert.equal(result.currency, "USD");
});
