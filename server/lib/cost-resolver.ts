/**
 * Cost Resolution
 *
 * Resolves what a fulfilled line item actually costs — production plus shipping —
 * at the moment the revenue event is recorded.
 *
 * Two rules govern this file:
 *
 * 1. **Snapshot, never look up later.** Providers change prices without notice
 *    and without versioning. A cost read six months after the sale is not the
 *    cost that applied to the sale, so every resolved cost is persisted onto the
 *    order row and read back from there forever after. Nothing in the payout path
 *    may re-resolve a cost for an order that already has one.
 *
 * 2. **Resolution sits behind this interface.** Cloud sandbox sessions are
 *    network-allowlisted and cannot reach api.printify.com, so the calculation
 *    logic has to be provable without it. `FixtureCostResolver` is the test
 *    implementation; `PrintifyCostResolver` is the live one. They are
 *    interchangeable and the royalty engine knows about neither.
 */

import { getProduct, getShipping, getVariants, isPrintifyConfigured } from "./printify";

export interface CostQuery {
  blueprintId: number;
  printProviderId: number;
  variantId: number;
  quantity: number;
  /** ISO-3166-1 alpha-2. Shipping is priced per destination. */
  destinationCountry: string;
  /** Printify shop + product, when the cost is read from a shop product. */
  shopId?: string;
  printifyProductId?: string;
}

export interface ResolvedCost {
  /** Production cost for the whole quantity, in minor units. */
  productionMinor: number;
  /** Shipping for the whole quantity, in minor units. */
  shippingMinor: number;
  currency: string;
  /** Where the number came from — persisted so a stale cost is auditable. */
  source: "printify-catalog" | "printify-product" | "fixture";
  /** When it was resolved. This is the snapshot timestamp. */
  resolvedAt: Date;
}

export interface CostResolver {
  resolveCost(query: CostQuery): Promise<ResolvedCost>;
}

export class CostResolutionError extends Error {
  constructor(message: string, readonly query: CostQuery) {
    super(message);
    this.name = "CostResolutionError";
  }
}

// ============================================================
// Printify — live resolution
// ============================================================

/**
 * Shipping profile as returned by
 * /catalog/blueprints/{id}/print_providers/{id}/shipping.json
 */
interface PrintifyShippingProfile {
  variant_ids: number[];
  first_item: { cost: number; currency: string };
  additional_items: { cost: number; currency: string };
  countries: string[];
}

/** Printify's catch-all country bucket. */
const REST_OF_THE_WORLD = "REST_OF_THE_WORLD";

export function selectShippingProfile(
  profiles: PrintifyShippingProfile[],
  variantId: number,
  destinationCountry: string
): PrintifyShippingProfile | null {
  const forVariant = profiles.filter((p) => p.variant_ids.includes(variantId));

  // An exact country match always beats the catch-all bucket.
  const exact = forVariant.find((p) => p.countries.includes(destinationCountry));
  if (exact) return exact;

  return forVariant.find((p) => p.countries.includes(REST_OF_THE_WORLD)) ?? null;
}

export function shippingForQuantity(
  profile: PrintifyShippingProfile,
  quantity: number
): number {
  if (quantity <= 0) return 0;
  return profile.first_item.cost + profile.additional_items.cost * (quantity - 1);
}

/**
 * Resolves against the live Printify API.
 *
 * Production cost is tried from the catalog variants endpoint first. That
 * endpoint does not carry a per-variant `cost` on every account and API
 * revision, so when it is absent the resolver falls back to the shop product,
 * whose variants always carry `cost` in minor units. Both paths are recorded
 * distinctly in `source` so a discrepancy is traceable rather than silent.
 *
 * This class is the part that cannot be exercised in a sandbox — it is
 * deliberately thin, and everything it feeds is covered by fixtures.
 */
export class PrintifyCostResolver implements CostResolver {
  async resolveCost(query: CostQuery): Promise<ResolvedCost> {
    if (!isPrintifyConfigured()) {
      throw new CostResolutionError("Printify is not configured", query);
    }

    const { productionMinor, currency, source } = await this.resolveProduction(query);
    const shippingMinor = await this.resolveShipping(query);

    return {
      productionMinor,
      shippingMinor,
      currency,
      source,
      resolvedAt: new Date(),
    };
  }

  private async resolveProduction(query: CostQuery): Promise<{
    productionMinor: number;
    currency: string;
    source: "printify-catalog" | "printify-product";
  }> {
    const catalog = await getVariants(query.blueprintId, query.printProviderId);
    const catalogVariant = (catalog?.variants ?? []).find(
      (v: any) => v.id === query.variantId
    );

    if (catalogVariant && typeof catalogVariant.cost === "number") {
      return {
        productionMinor: catalogVariant.cost * query.quantity,
        currency: catalogVariant.currency ?? "USD",
        source: "printify-catalog",
      };
    }

    if (!query.shopId || !query.printifyProductId) {
      throw new CostResolutionError(
        `Catalog variant ${query.variantId} carries no cost and no shop product was supplied to fall back to`,
        query
      );
    }

    const product = await getProduct(query.shopId, query.printifyProductId);
    const productVariant = (product?.variants ?? []).find(
      (v: any) => v.id === query.variantId
    );

    if (!productVariant || typeof productVariant.cost !== "number") {
      throw new CostResolutionError(
        `No production cost for variant ${query.variantId} on product ${query.printifyProductId}`,
        query
      );
    }

    return {
      productionMinor: productVariant.cost * query.quantity,
      currency: product.currency ?? "USD",
      source: "printify-product",
    };
  }

  private async resolveShipping(query: CostQuery): Promise<number> {
    const shipping = await getShipping(query.blueprintId, query.printProviderId);
    const profile = selectShippingProfile(
      shipping?.profiles ?? [],
      query.variantId,
      query.destinationCountry
    );

    if (!profile) {
      throw new CostResolutionError(
        `No shipping profile for variant ${query.variantId} to ${query.destinationCountry}`,
        query
      );
    }

    return shippingForQuantity(profile, query.quantity);
  }
}

// ============================================================
// Fixtures — test resolution
// ============================================================

export interface CostFixture {
  blueprintId: number;
  printProviderId: number;
  variantId: number;
  /** Production cost for a single unit, in minor units. */
  unitProductionMinor: number;
  currency: string;
  shipping: Array<{
    countries: string[];
    firstItemMinor: number;
    additionalItemMinor: number;
  }>;
}

/**
 * Resolves against a static fixture table.
 *
 * This is not a mock bolted on for one test — it is the implementation that
 * makes the money math verifiable anywhere, including in sandboxes with no
 * network. The fixture values are real Printify catalog figures captured on the
 * date recorded in the fixture file; when they drift, the fixture is what gets
 * re-captured, not the calculation.
 */
export class FixtureCostResolver implements CostResolver {
  constructor(private readonly fixtures: CostFixture[]) {}

  async resolveCost(query: CostQuery): Promise<ResolvedCost> {
    const fixture = this.fixtures.find(
      (f) =>
        f.blueprintId === query.blueprintId &&
        f.printProviderId === query.printProviderId &&
        f.variantId === query.variantId
    );

    if (!fixture) {
      throw new CostResolutionError(
        `No cost fixture for blueprint ${query.blueprintId} / provider ${query.printProviderId} / variant ${query.variantId}`,
        query
      );
    }

    const rate =
      fixture.shipping.find((s) => s.countries.includes(query.destinationCountry)) ??
      fixture.shipping.find((s) => s.countries.includes(REST_OF_THE_WORLD));

    if (!rate) {
      throw new CostResolutionError(
        `No shipping fixture for variant ${query.variantId} to ${query.destinationCountry}`,
        query
      );
    }

    const shippingMinor =
      query.quantity <= 0
        ? 0
        : rate.firstItemMinor + rate.additionalItemMinor * (query.quantity - 1);

    return {
      productionMinor: fixture.unitProductionMinor * query.quantity,
      shippingMinor,
      currency: fixture.currency,
      source: "fixture",
      resolvedAt: new Date(),
    };
  }
}
