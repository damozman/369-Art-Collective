/**
 * Capture REAL Printify costs and catalog IDs.
 *
 * Run this on a machine that has live Printify credentials. It reads the
 * products actually in the shop, extracts each variant's true production cost
 * and the shipping rates that apply, and prints a ready-to-paste replacement
 * for `server/lib/__fixtures__/printify-costs.ts`.
 *
 * WHY THIS EXISTS. The fixture in the repo is invented — interpolated from an
 * undated table, with placeholder blueprint, provider and variant IDs. The
 * royalty arithmetic is proven against it, but the *inputs* are guesses, and
 * paying a real artist from a guessed cost is the exact defect Phase 0 removed.
 * This closes that gap, and it can only be run where the credentials live.
 *
 * NOTHING SECRET IS PRINTED. The output is catalog data — product names, IDs,
 * costs, shipping rates. It is safe to paste into a chat or a ticket. The API
 * token is read from the environment and never echoed.
 *
 *   npm run printify:costs                 # human-readable summary
 *   npm run printify:costs -- --fixture    # emit the fixture file
 *   npm run printify:costs > costs.txt     # capture to a file
 */

import {
  getProducts,
  getShipping,
  getShops,
  isPrintifyConfigured,
} from "../server/lib/printify";

interface VariantCost {
  variantId: number;
  title: string;
  costMinor: number;
  priceMinor: number;
}

interface ProductSummary {
  productId: string;
  title: string;
  blueprintId: number;
  printProviderId: number;
  variants: VariantCost[];
}

async function main() {
  if (!isPrintifyConfigured()) {
    console.error(
      "PRINTIFY_API_TOKEN is not set.\n\n" +
        "Add it to .env.local on this machine (it is gitignored), then run again:\n" +
        "  PRINTIFY_API_TOKEN=your_token_here\n"
    );
    process.exit(1);
  }

  const emitFixture = process.argv.includes("--fixture");

  const shops = await getShops();
  if (shops.length === 0) {
    console.error("No Printify shops found on this account.");
    process.exit(1);
  }

  console.log(`# Printify catalog capture — ${new Date().toISOString()}`);
  console.log(`# Shops: ${shops.map((s: any) => `${s.title} (${s.id})`).join(", ")}\n`);

  const products: ProductSummary[] = [];

  for (const shop of shops) {
    let page = 1;
    // Printify paginates; keep going until a page comes back empty.
    for (;;) {
      const response = await getProducts(String(shop.id), page);
      const items = response?.data ?? [];
      if (items.length === 0) break;

      for (const product of items) {
        products.push({
          productId: String(product.id),
          title: product.title,
          blueprintId: product.blueprint_id,
          printProviderId: product.print_provider_id,
          variants: (product.variants ?? [])
            .filter((v: any) => v.is_enabled !== false)
            .map((v: any) => ({
              variantId: v.id,
              title: v.title,
              costMinor: v.cost,
              priceMinor: v.price,
            })),
        });
      }

      if (items.length < 50) break;
      page += 1;
    }
  }

  if (products.length === 0) {
    console.error(
      "No products found. Create at least one product in Printify first — the\n" +
        "catalog endpoints do not expose per-variant cost reliably, but shop\n" +
        "products always do."
    );
    process.exit(1);
  }

  // Unique blueprint + provider pairs, so shipping is fetched once each.
  const pairs = new Map<string, { blueprintId: number; printProviderId: number }>();
  for (const product of products) {
    pairs.set(`${product.blueprintId}:${product.printProviderId}`, {
      blueprintId: product.blueprintId,
      printProviderId: product.printProviderId,
    });
  }

  const shippingByPair = new Map<string, any>();
  for (const [key, pair] of pairs) {
    try {
      shippingByPair.set(
        key,
        await getShipping(pair.blueprintId, pair.printProviderId)
      );
    } catch (error: any) {
      console.error(`# Could not fetch shipping for ${key}: ${error.message}`);
    }
  }

  if (!emitFixture) {
    printSummary(products, shippingByPair);
    console.log(
      "\n# Re-run with --fixture to emit a ready-to-paste fixture file:\n" +
        "#   npm run printify:costs -- --fixture > printify-costs.ts\n"
    );
    return;
  }

  printFixture(products, shippingByPair);
}

function printSummary(products: ProductSummary[], shipping: Map<string, any>) {
  console.log("## Products and real per-variant costs\n");

  for (const product of products) {
    const key = `${product.blueprintId}:${product.printProviderId}`;
    console.log(`### ${product.title}`);
    console.log(
      `Blueprint ${product.blueprintId} · Provider ${product.printProviderId} · Product ${product.productId}`
    );

    for (const variant of product.variants) {
      console.log(
        `  ${String(variant.variantId).padEnd(10)} ${variant.title.padEnd(34)} ` +
          `cost ${money(variant.costMinor).padStart(9)}   listed ${money(variant.priceMinor)}`
      );
    }

    // Shipping profiles are per-variant. Printing every profile for the
    // blueprint/provider pair — as this did originally — shows rates for sizes
    // the product does not sell, which makes the economics look wrong in both
    // directions. Filter to the variants actually on this product.
    const profiles = shipping.get(key)?.profiles ?? [];
    for (const variant of product.variants) {
      const forVariant = profiles.filter((p: any) =>
        (p.variant_ids ?? []).includes(variant.variantId)
      );

      for (const profile of forVariant) {
        const countries = (profile.countries ?? []).slice(0, 4).join(", ");
        console.log(
          `  shipping for ${variant.variantId} [${countries}] ` +
            `first ${money(profile.first_item?.cost ?? 0)}, ` +
            `additional ${money(profile.additional_items?.cost ?? 0)}`
        );
      }

      // The number that decides whether a sale is profitable.
      const us = forVariant.find((p: any) => (p.countries ?? []).includes("US"));
      if (us) {
        const production = variant.costMinor;
        const shippingUs = us.first_item?.cost ?? 0;
        const fee = Math.round(variant.priceMinor * 0.029) + 30;
        const net = variant.priceMinor - production - shippingUs - fee;
        console.log(
          `  >> US economics for ${variant.variantId}: ` +
            `sells ${money(variant.priceMinor)} − production ${money(production)} ` +
            `− shipping ${money(shippingUs)} − fee ${money(fee)} = ` +
            `${net < 0 ? "LOSS " : "profit "}${money(net)}`
        );
      }
    }
    console.log("");
  }
}

function printFixture(products: ProductSummary[], shipping: Map<string, any>) {
  console.log(`/**
 * Printify costs — CAPTURED FROM THE LIVE API.
 *
 * Generated by scripts/fetch-printify-costs.ts on ${new Date().toISOString()}.
 * These are real catalog IDs and real per-variant costs, replacing the invented
 * fixture the repo shipped with. Re-capture whenever Printify changes pricing.
 */

import type { CostFixture } from "../cost-resolver";

export const PRINTIFY_COST_FIXTURES: CostFixture[] = [`);

  for (const product of products) {
    const key = `${product.blueprintId}:${product.printProviderId}`;
    const profiles = shipping.get(key)?.profiles ?? [];

    for (const variant of product.variants) {
      const profile =
        profiles.find((p: any) => (p.variant_ids ?? []).includes(variant.variantId)) ??
        profiles[0];

      const usFirst = profile?.first_item?.cost ?? 0;
      const usAdditional = profile?.additional_items?.cost ?? 0;

      console.log(`  {
    // ${product.title} — ${variant.title}
    blueprintId: ${product.blueprintId},
    printProviderId: ${product.printProviderId},
    variantId: ${variant.variantId},
    unitProductionMinor: ${variant.costMinor},
    currency: "USD",
    shipping: [
      { countries: ["US"], firstItemMinor: ${usFirst}, additionalItemMinor: ${usAdditional} },
      { countries: ["REST_OF_THE_WORLD"], firstItemMinor: ${usFirst}, additionalItemMinor: ${usAdditional} },
    ],
  },`);
    }
  }

  console.log("];");
}

function money(minor: number): string {
  return `$${(minor / 100).toFixed(2)}`;
}

main().catch((error) => {
  console.error("Failed:", error.message);
  process.exit(1);
});
