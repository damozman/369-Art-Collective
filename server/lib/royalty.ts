/**
 * Royalty — the one definition.
 *
 * This file replaces five conflicting royalty calculations that coexisted in the
 * repo:
 *
 *   1. `financials.ts`          — 36.9% of (price − 40%-of-price), and the only
 *                                 one the Shopify webhook actually called
 *   2. `order-processor.ts`     — tier% of (price − $15 − $5 placeholder costs)
 *   3. `shared/financial-utils` — tier% of retail price, no costs subtracted
 *   4. `royalty-calculator.ts`  — tier ladder keyed on monthly sales *amount*
 *   5. `payout-service.ts`      — a different tier ladder keyed on sales *count*
 *
 * None of them subtracted payment processing fees. All are gone.
 *
 * THE CANONICAL BASIS — net after cost of goods, shipping, and processing fees:
 *
 *     net     = gross − production − shipping − processingFee
 *     royalty = net × tier%          (tier from the artist's monthly sales)
 *     bonus   = net × 5%             (only if the sale came via a referral link)
 *
 * Two properties this basis is chosen to have:
 *
 * - **The contributor is paid on what the sale actually earned.** Applying a
 *   percentage to retail (definition 3) pays out on money the business never
 *   kept, which at low price points can exceed the entire margin.
 * - **Every input is a snapshot.** Costs are resolved once at event time and
 *   persisted; nothing here re-derives a cost from a provider later.
 *
 * Negative net is possible — a deeply discounted order can cost more to fulfil
 * than it brings in. The royalty floors at zero rather than going negative: a
 * contributor is never billed for a sale. The negative net is still recorded on
 * the order, so the loss stays visible rather than being quietly zeroed.
 */

import {
  PAYMENT_PROCESSING,
  REFERRAL_BONUS_PERCENT,
  royaltyPercentForMonthlySales,
} from "@shared/financial-utils";
import { allocate, applyRate } from "./money";

export interface LineItemCosts {
  /** Retail charged for this line, whole quantity, minor units. */
  grossMinor: number;
  /** Snapshotted production cost, whole quantity, minor units. */
  productionMinor: number;
  /** Snapshotted shipping, whole quantity, minor units. */
  shippingMinor: number;
  /** This line's share of the order's payment processing fee, minor units. */
  processingFeeMinor: number;
  currency: string;
}

export interface RoyaltyBreakdown {
  netMinor: number;
  royaltyTierPercent: number;
  baseRoyaltyMinor: number;
  referralBonusMinor: number;
  totalEarningsMinor: number;
  currency: string;
}

/**
 * Payment processing fee for a whole order.
 *
 * Charged per transaction, not per line — Stripe takes a percentage of the
 * order total plus one fixed fee regardless of how many items it contains.
 * Computing it per line would over-charge the fixed component by the number of
 * lines, so it is computed once here and apportioned by `allocateProcessingFee`.
 */
export function calculateProcessingFee(orderGrossMinor: number): number {
  if (orderGrossMinor <= 0) return 0;
  return applyRate(orderGrossMinor, PAYMENT_PROCESSING.percent) + PAYMENT_PROCESSING.fixedMinor;
}

/**
 * Split an order's processing fee across its lines, weighted by line gross.
 *
 * Uses largest-remainder allocation so the parts sum to exactly the fee — no
 * line silently absorbs a rounding cent, and none is invented.
 */
export function allocateProcessingFee(
  orderGrossMinors: number[],
  totalFeeMinor: number
): number[] {
  return allocate(totalFeeMinor, orderGrossMinors);
}

/** Net after every cost the business bears on the sale. May be negative. */
export function calculateNet(line: LineItemCosts): number {
  return (
    line.grossMinor - line.productionMinor - line.shippingMinor - line.processingFeeMinor
  );
}

/**
 * The single royalty calculation. Everything that pays a contributor calls this.
 */
export function calculateRoyalty(
  line: LineItemCosts,
  monthlySalesMinor: number,
  hasReferralBonus = false
): RoyaltyBreakdown {
  const netMinor = calculateNet(line);
  const royaltyTierPercent = royaltyPercentForMonthlySales(monthlySalesMinor);

  // Floor at zero: a loss-making sale earns nothing, it never claws back.
  const payableNet = Math.max(netMinor, 0);

  const baseRoyaltyMinor = applyRate(payableNet, royaltyTierPercent);
  const referralBonusMinor = hasReferralBonus
    ? applyRate(payableNet, REFERRAL_BONUS_PERCENT)
    : 0;

  return {
    netMinor,
    royaltyTierPercent,
    baseRoyaltyMinor,
    referralBonusMinor,
    totalEarningsMinor: baseRoyaltyMinor + referralBonusMinor,
    currency: line.currency,
  };
}
