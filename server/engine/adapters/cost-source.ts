/**
 * Where an adapter gets costs the source system does not know.
 *
 * Shopify knows what the customer paid. It does not know what the item cost to
 * make or to ship — only the supplier does, and which supplier that is depends
 * on the vertical. Printify for print-on-demand, a pressing plant for vinyl, a
 * printer for books, nothing at all for a purely digital product.
 *
 * This is the engine-side counterpart to `server/lib/cost-resolver.ts`, which
 * belongs to the marketplace and is not imported here — the engine and the
 * marketplace are deliberately unlinked so the marketplace tables can be
 * dropped wholesale in Phase 2.
 *
 * THE DEFAULT REFUSES TO INVENT. `NoLineCostSource` returns no costs and says
 * so, rather than returning a plausible margin. A rule that deducts a cost type
 * which never arrives simply does not deduct it — so the failure mode of the
 * default is *overpaying the contributor out of the merchant's margin*, which
 * is visible in the margin, rather than underpaying them, which is not visible
 * to anyone until they complain.
 */

import type { CostInput } from "../revenue-event";

/** Everything known about a line at the point costs are asked for. */
export interface LineCostContext {
  tenantId: string;
  currency: string;
  quantity: number;
  grossAmountMinor: bigint;
  /** The engine's reference for the work, when it could be read. */
  workRef: string | null;
  /** Provider-native identifiers, for a supplier lookup. */
  sku: string | null;
  productId: string | null;
  variantId: string | null;
  occurredAt: Date;
}

export interface LineCostResult {
  costs: CostInput[];
  /**
   * Set when costs could not be determined and the line must not be allocated.
   * A resolver that cannot price a line says so; it never returns an estimate.
   */
  holdReason?: string;
}

export interface LineCostSource {
  resolve(context: LineCostContext): Promise<LineCostResult>;
}

/** No supplier costs. Correct for digital goods and for a store that has none. */
export class NoLineCostSource implements LineCostSource {
  async resolve(): Promise<LineCostResult> {
    return { costs: [] };
  }
}

/**
 * Costs from a lookup table, keyed by SKU. For tests and dry runs.
 *
 * A SKU that is not in the table holds the line rather than returning zero,
 * because zero production cost is a real and very wrong number.
 */
export class FixtureLineCostSource implements LineCostSource {
  constructor(
    private readonly table: Map<string, Array<{ type: string; amountMinor: bigint }>>
  ) {}

  async resolve(context: LineCostContext): Promise<LineCostResult> {
    const key = context.sku ?? "";
    const entry = this.table.get(key);

    if (!entry) {
      return {
        costs: [],
        holdReason: `No cost on file for SKU "${key}".`,
      };
    }

    return {
      costs: entry.map((cost) => ({
        type: cost.type,
        // Per-unit costs scale with quantity; the fixture stores unit costs.
        amountMinor: cost.amountMinor * BigInt(context.quantity),
        currency: context.currency,
        source: "fixture",
        resolvedAt: context.occurredAt,
      })),
    };
  }
}
