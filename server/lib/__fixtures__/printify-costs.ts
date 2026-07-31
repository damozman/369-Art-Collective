/**
 * Printify cost fixtures.
 *
 * PROVENANCE — read before trusting these numbers.
 *
 * The *shape* is real: finishes and sizes match the live SKU vocabulary in
 * `config/provider_config.json`, and blueprint IDs match the wall-art
 * blueprints the storefront was built against.
 *
 * The *costs* are not verified. They are interpolated from the undated
 * `PRINTIFY_PRODUCTS` table in `shared/financial-utils.ts` onto the real size
 * grid, and the print-provider and variant IDs are placeholders chosen to be
 * internally consistent — they are not live catalog IDs. Sandbox sessions
 * cannot reach api.printify.com, so nothing here could be re-pulled.
 *
 * What this fixture does and does not establish:
 *
 * - It DOES establish that, given a set of costs, the royalty engine produces
 *   exactly the amounts asserted in the tests. That is the part that was
 *   broken and that is now provable anywhere.
 * - It does NOT establish that these are Printify's current prices.
 *
 * Before real money moves, re-capture this file by running
 * `PrintifyCostResolver` against live credentials on a machine that has them,
 * and replace the values with what comes back. Credentials never enter a
 * sandbox or a transcript.
 */

import type { CostFixture } from "../cost-resolver";

/** Wall-art blueprints, keyed by the finish token used in SKUs. */
export const BLUEPRINTS = {
  Paper: 852,
  Canvas: 555,
  Metal: 1206,
} as const;

/** Placeholder print-provider IDs — see the provenance note above. */
export const PROVIDERS = {
  Paper: 1,
  Canvas: 2,
  Metal: 4,
} as const;

const ELSEWHERE = ["REST_OF_THE_WORLD"];

interface FixtureSeed {
  finish: keyof typeof BLUEPRINTS;
  size: string;
  variantId: number;
  unitProductionMinor: number;
  usFirstMinor: number;
  usAdditionalMinor: number;
  rowFirstMinor: number;
  rowAdditionalMinor: number;
}

const SEEDS: FixtureSeed[] = [
  // Paper — blueprint 852
  { finish: "Paper", size: "8x10", variantId: 85201, unitProductionMinor: 404, usFirstMinor: 629, usAdditionalMinor: 229, rowFirstMinor: 1299, rowAdditionalMinor: 599 },
  { finish: "Paper", size: "12x16", variantId: 85202, unitProductionMinor: 500, usFirstMinor: 629, usAdditionalMinor: 229, rowFirstMinor: 1299, rowAdditionalMinor: 599 },
  { finish: "Paper", size: "18x24", variantId: 85203, unitProductionMinor: 550, usFirstMinor: 629, usAdditionalMinor: 229, rowFirstMinor: 1299, rowAdditionalMinor: 599 },
  { finish: "Paper", size: "24x36", variantId: 85204, unitProductionMinor: 629, usFirstMinor: 700, usAdditionalMinor: 250, rowFirstMinor: 1499, rowAdditionalMinor: 699 },

  // Canvas — blueprint 555
  { finish: "Canvas", size: "8x10", variantId: 55501, unitProductionMinor: 809, usFirstMinor: 700, usAdditionalMinor: 300, rowFirstMinor: 1599, rowAdditionalMinor: 799 },
  { finish: "Canvas", size: "12x16", variantId: 55502, unitProductionMinor: 1200, usFirstMinor: 750, usAdditionalMinor: 325, rowFirstMinor: 1699, rowAdditionalMinor: 849 },
  { finish: "Canvas", size: "18x24", variantId: 55503, unitProductionMinor: 1500, usFirstMinor: 800, usAdditionalMinor: 350, rowFirstMinor: 1799, rowAdditionalMinor: 899 },
  { finish: "Canvas", size: "24x36", variantId: 55504, unitProductionMinor: 1800, usFirstMinor: 850, usAdditionalMinor: 375, rowFirstMinor: 1899, rowAdditionalMinor: 949 },

  // Metal — blueprint 1206
  { finish: "Metal", size: "8x10", variantId: 120601, unitProductionMinor: 2500, usFirstMinor: 850, usAdditionalMinor: 375, rowFirstMinor: 1899, rowAdditionalMinor: 949 },
  { finish: "Metal", size: "12x16", variantId: 120602, unitProductionMinor: 2800, usFirstMinor: 850, usAdditionalMinor: 375, rowFirstMinor: 1899, rowAdditionalMinor: 949 },
  { finish: "Metal", size: "18x24", variantId: 120603, unitProductionMinor: 3500, usFirstMinor: 900, usAdditionalMinor: 400, rowFirstMinor: 1999, rowAdditionalMinor: 999 },
  { finish: "Metal", size: "24x36", variantId: 120604, unitProductionMinor: 4500, usFirstMinor: 1000, usAdditionalMinor: 450, rowFirstMinor: 2199, rowAdditionalMinor: 1099 },
];

/**
 * SKU finish+size → Printify identifiers.
 *
 * The Shopify webhook gives us a SKU and a Shopify variant ID; neither is a
 * Printify variant. Something has to bridge them, and until now nothing did —
 * which is part of why the cost lookup was a hardcoded constant.
 */
export const CATALOG_MAP: Array<{
  finish: string;
  size: string;
  blueprintId: number;
  printProviderId: number;
  variantId: number;
}> = SEEDS.map((s) => ({
  finish: s.finish,
  size: s.size,
  blueprintId: BLUEPRINTS[s.finish],
  printProviderId: PROVIDERS[s.finish],
  variantId: s.variantId,
}));

export const PRINTIFY_COST_FIXTURES: CostFixture[] = SEEDS.map((s) => ({
  blueprintId: BLUEPRINTS[s.finish],
  printProviderId: PROVIDERS[s.finish],
  variantId: s.variantId,
  unitProductionMinor: s.unitProductionMinor,
  currency: "USD",
  shipping: [
    { countries: ["US"], firstItemMinor: s.usFirstMinor, additionalItemMinor: s.usAdditionalMinor },
    { countries: ELSEWHERE, firstItemMinor: s.rowFirstMinor, additionalItemMinor: s.rowAdditionalMinor },
  ],
}));
