/**
 * SKU → Printify catalog resolution.
 *
 * The Shopify webhook hands us a SKU and a *Shopify* variant ID. Neither is a
 * Printify blueprint, print provider, or variant — and until now nothing
 * bridged the two, which is a large part of why the cost lookup in the order
 * processor was a hardcoded `15.00`. There was no route from a sold line item
 * to the thing whose cost we needed.
 *
 * SKU format (see `config/provider_config.json`):
 *     ART-{artistShort}-{artworkId}-{size}-{finish}
 *     e.g. ART-JH-abc123-18x24-Canvas
 *
 * When a SKU does not map, this returns null and the caller must refuse to
 * calculate a royalty for it. That refusal is the point: falling back to an
 * assumed cost is precisely the failure mode being removed here, and a line
 * item held for review is recoverable in a way that a silently wrong payout
 * is not.
 */

import { CATALOG_MAP } from "./__fixtures__/printify-costs";

export interface SkuParts {
  artistShort: string;
  artworkId: string;
  size: string;
  finish: string;
}

export interface CatalogEntry {
  blueprintId: number;
  printProviderId: number;
  variantId: number;
}

/**
 * Parse a full SKU into its four components.
 *
 * The previous parser in `order-processor.ts` stopped after the artwork ID and
 * discarded size and finish — the two fields that determine what the item
 * costs.
 */
export function parseSKU(sku: string): SkuParts | null {
  const match = sku.match(/^ART-([A-Za-z0-9]+)-([A-Za-z0-9-]+?)-(\d+x\d+)-([A-Za-z]+)$/);
  if (!match) return null;

  return {
    artistShort: match[1],
    artworkId: match[2],
    size: match[3],
    finish: match[4],
  };
}

/** Look up the Printify identifiers for a size + finish combination. */
export function resolveCatalogEntry(size: string, finish: string): CatalogEntry | null {
  const entry = CATALOG_MAP.find(
    (c) =>
      c.size.toLowerCase() === size.toLowerCase() &&
      c.finish.toLowerCase() === finish.toLowerCase()
  );

  if (!entry) return null;

  return {
    blueprintId: entry.blueprintId,
    printProviderId: entry.printProviderId,
    variantId: entry.variantId,
  };
}

/** Parse and resolve in one step. Null if either half fails. */
export function resolveSku(
  sku: string
): { parts: SkuParts; catalog: CatalogEntry } | null {
  const parts = parseSKU(sku);
  if (!parts) return null;

  const catalog = resolveCatalogEntry(parts.size, parts.finish);
  if (!catalog) return null;

  return { parts, catalog };
}
