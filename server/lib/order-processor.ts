/**
 * Order Processor
 *
 * Turns a Shopify order into recorded revenue events and contributor royalties.
 * This is the only path from a sale to money owed; `server/lib/financials.ts`
 * previously duplicated it with a different, worse calculation and was the one
 * the webhook actually called. It has been deleted.
 *
 * What changed in Phase 0 step 5:
 *
 * - Costs are **resolved and snapshotted** per line item instead of assumed.
 *   The old code used `printifyCost = 15.00` and `shippingCost = 5.00` flat,
 *   which underpaid cheap items by roughly 3x and overpaid expensive ones.
 * - Payment processing fees are computed **once per order** and apportioned
 *   across its lines, then subtracted before royalties.
 * - A line whose costs cannot be resolved is **held for review**, not paid on
 *   an assumption. See the note on `needs_review` below.
 * - Recruitment residuals are gone — no sale generates a second sale row for
 *   somebody else.
 */

import type { CostResolver } from "./cost-resolver";
import { CostResolutionError } from "./cost-resolver";
import { formatMinorToDecimal, parseDecimalToMinor } from "./money";
import {
  allocateProcessingFee,
  calculateProcessingFee,
  calculateRoyalty,
} from "./royalty";
import { resolveSku } from "./sku-catalog";

interface ShopifyLineItem {
  id: number;
  product_id: number;
  variant_id: number;
  sku: string;
  title: string;
  variant_title?: string;
  quantity: number;
  price: string;
  name: string;
}

interface ShopifyOrder {
  id: number;
  email: string;
  created_at: string;
  total_price: string;
  currency?: string;
  line_items: ShopifyLineItem[];
  shipping_address?: {
    first_name: string;
    last_name: string;
    address1: string;
    address2?: string;
    city: string;
    province: string;
    province_code: string;
    country: string;
    country_code: string;
    zip: string;
    phone?: string;
  };
  landing_site?: string; // URL with UTM parameters
  referring_site?: string;
}

/**
 * Extract UTM parameters from landing site URL
 */
function extractUTMParams(landingSite?: string): {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  referralCode?: string;
} | null {
  if (!landingSite) return null;

  try {
    const url = new URL(landingSite);
    const params = new URLSearchParams(url.search);

    const utmSource = params.get("utm_source") || undefined;
    const utmMedium = params.get("utm_medium") || undefined;
    const utmCampaign = params.get("utm_campaign") || undefined;

    // Check if utm_source contains a referral code
    const referralCode = utmSource?.match(/^[A-Z]+-[A-Z0-9]{8}$/)?.[0];

    if (utmSource || utmMedium || utmCampaign) {
      return { utmSource, utmMedium, utmCampaign, referralCode };
    }
  } catch (error) {
    console.error("Error parsing landing site URL:", error);
  }

  return null;
}

/** A line item that has been costed and is ready to have a royalty taken. */
interface CostedLine {
  lineItem: ShopifyLineItem;
  artwork: any;
  artist: any;
  grossMinor: number;
  productionMinor: number;
  shippingMinor: number;
  currency: string;
  costSource: string;
  costResolvedAt: Date;
}

/** A line item that could not be costed, and therefore must not be paid on. */
interface HeldLine {
  lineItem: ShopifyLineItem;
  artwork: any | null;
  artist: any | null;
  grossMinor: number;
  reason: string;
}

/**
 * The slice of storage this processor needs.
 *
 * Declared as a port rather than importing `storage` directly, for the same
 * reason cost resolution sits behind an interface: importing the real storage
 * module opens a database connection at import time, which would make the
 * money math untestable in exactly the environments where it most needs
 * proving. The webhook passes the real implementation.
 */
export interface OrderStore {
  getAllArtists(): Promise<any[]>;
  getArtwork(id: string): Promise<any>;
  getArtist(id: string): Promise<any>;
  createOrder(values: any): Promise<any>;
  createSale(values: any): Promise<any>;
  updateArtworkLastSaleDate(artworkId: string, date: Date): Promise<any>;
}

export interface ProcessOrderResult {
  processed: number;
  heldForReview: number;
  skipped: number;
}

/**
 * Process a Shopify order.
 *
 * Runs in two passes. The first resolves and snapshots costs for every line;
 * the second calculates royalties once the order-level processing fee is known
 * and can be apportioned. A single pass cannot do this — the fee depends on the
 * order total, which is not known until every line has been seen.
 */
export async function processShopifyOrder(
  shopifyOrder: ShopifyOrder,
  costResolver: CostResolver,
  store: OrderStore
): Promise<ProcessOrderResult> {
  console.log(`Processing Shopify order: ${shopifyOrder.id}`);

  const orderCurrency = shopifyOrder.currency ?? "USD";
  const destinationCountry = shopifyOrder.shipping_address?.country_code ?? "US";

  const utmParams = extractUTMParams(shopifyOrder.landing_site);
  let referralArtist = null;

  if (utmParams?.referralCode) {
    const allArtists = await store.getAllArtists();
    referralArtist = allArtists.find((a) => a.referralCode === utmParams.referralCode);
    if (referralArtist) {
      console.log(
        `Order referred by artist: ${referralArtist.name} (${referralArtist.referralCode})`
      );
    }
  }

  // ---- Pass 1: resolve costs -------------------------------------------
  const costed: CostedLine[] = [];
  const held: HeldLine[] = [];
  let skipped = 0;

  for (const lineItem of shopifyOrder.line_items) {
    if (!lineItem.sku) {
      console.warn(`Line item ${lineItem.id} has no SKU, skipping`);
      skipped++;
      continue;
    }

    const resolved = resolveSku(lineItem.sku);
    if (!resolved) {
      console.warn(`Could not resolve SKU to a catalog entry: ${lineItem.sku}, skipping`);
      skipped++;
      continue;
    }

    const grossMinor = parseDecimalToMinor(lineItem.price) * lineItem.quantity;

    try {
      const artwork = await store.getArtwork(resolved.parts.artworkId);
      if (!artwork) {
        console.error(`Artwork not found: ${resolved.parts.artworkId}`);
        skipped++;
        continue;
      }

      const artist = await store.getArtist(artwork.artistId);
      if (!artist) {
        console.error(`Artist not found: ${artwork.artistId}`);
        skipped++;
        continue;
      }

      try {
        const cost = await costResolver.resolveCost({
          blueprintId: resolved.catalog.blueprintId,
          printProviderId: resolved.catalog.printProviderId,
          variantId: resolved.catalog.variantId,
          quantity: lineItem.quantity,
          destinationCountry,
          printifyProductId: artwork.printifyProductId ?? undefined,
        });

        if (cost.currency !== orderCurrency) {
          throw new CostResolutionError(
            `Cost currency ${cost.currency} does not match order currency ${orderCurrency}`,
            {
              blueprintId: resolved.catalog.blueprintId,
              printProviderId: resolved.catalog.printProviderId,
              variantId: resolved.catalog.variantId,
              quantity: lineItem.quantity,
              destinationCountry,
            }
          );
        }

        costed.push({
          lineItem,
          artwork,
          artist,
          grossMinor,
          productionMinor: cost.productionMinor,
          shippingMinor: cost.shippingMinor,
          currency: cost.currency,
          costSource: cost.source,
          costResolvedAt: cost.resolvedAt,
        });
      } catch (costError: any) {
        // Deliberate: hold the line rather than assume a cost. An unpaid line
        // held for review can be fixed; a royalty paid on an invented cost
        // cannot be, once the money has left.
        console.error(
          `Cost resolution failed for line ${lineItem.id} (${lineItem.sku}): ${costError.message}`
        );
        held.push({
          lineItem,
          artwork,
          artist,
          grossMinor,
          reason: costError.message ?? "Cost resolution failed",
        });
      }
    } catch (error: any) {
      console.error(`Error preparing line item ${lineItem.id}:`, error);
      skipped++;
    }
  }

  // ---- Processing fee: once per order, then apportioned ------------------
  // Charged per transaction, so it is computed on the order total (including
  // lines held for review — the fee was incurred regardless) and split across
  // the lines by gross. Computing it per line would multiply the fixed 30c
  // component by the number of lines.
  const allLines = [...costed, ...held];
  const orderGrossMinor = allLines.reduce((sum, l) => sum + l.grossMinor, 0);
  const totalFeeMinor = calculateProcessingFee(orderGrossMinor);
  const feeShares = allocateProcessingFee(
    allLines.map((l) => l.grossMinor),
    totalFeeMinor
  );

  // ---- Pass 2: record ----------------------------------------------------
  for (let i = 0; i < costed.length; i++) {
    const line = costed[i];
    const processingFeeMinor = feeShares[i];

    try {
      const monthlySalesMinor = parseDecimalToMinor(line.artist.monthlySales ?? "0");
      const hasReferralBonus = !!referralArtist && referralArtist.id !== line.artist.id;

      const royalty = calculateRoyalty(
        {
          grossMinor: line.grossMinor,
          productionMinor: line.productionMinor,
          shippingMinor: line.shippingMinor,
          processingFeeMinor,
          currency: line.currency,
        },
        monthlySalesMinor,
        hasReferralBonus
      );

      if (royalty.netMinor < 0) {
        console.warn(
          `Order ${shopifyOrder.id} line ${line.lineItem.id} is loss-making: net ${formatMinorToDecimal(royalty.netMinor)} ${line.currency}. Royalty floored at zero.`
        );
      }

      const order = await store.createOrder({
        shopifyOrderId: shopifyOrder.id.toString(),
        shopifyLineItemId: line.lineItem.id.toString(),
        artworkId: line.artwork.id,
        artistId: line.artist.id,
        productPrice: formatMinorToDecimal(line.grossMinor),
        printifyCost: formatMinorToDecimal(line.productionMinor),
        shippingCost: formatMinorToDecimal(line.shippingMinor),
        profit: formatMinorToDecimal(royalty.netMinor),
        currency: line.currency,
        grossMinor: line.grossMinor,
        productionMinor: line.productionMinor,
        shippingMinorAmount: line.shippingMinor,
        processingFeeMinor,
        netMinor: royalty.netMinor,
        costSource: line.costSource,
        costResolvedAt: line.costResolvedAt,
        utmSource: utmParams?.utmSource || null,
        utmMedium: utmParams?.utmMedium || null,
        utmCampaign: utmParams?.utmCampaign || null,
        referralArtistId: referralArtist?.id || null,
        referralBonus: hasReferralBonus,
        status: "pending",
      } as any);

      const sale = await store.createSale({
        orderId: order.id,
        artistId: line.artist.id,
        artworkId: line.artwork.id,
        saleAmount: formatMinorToDecimal(line.grossMinor),
        profit: formatMinorToDecimal(royalty.netMinor),
        royaltyTier: royalty.royaltyTierPercent,
        baseRoyalty: formatMinorToDecimal(royalty.baseRoyaltyMinor),
        referralBonus: formatMinorToDecimal(royalty.referralBonusMinor),
        recruitmentBonus: "0",
        totalEarnings: formatMinorToDecimal(royalty.totalEarningsMinor),
        currency: royalty.currency,
        netMinor: royalty.netMinor,
        baseRoyaltyMinor: royalty.baseRoyaltyMinor,
        referralBonusMinor: royalty.referralBonusMinor,
        totalEarningsMinor: royalty.totalEarningsMinor,
      } as any);

      console.log(
        `Sale ${sale.id}: gross ${formatMinorToDecimal(line.grossMinor)}, ` +
          `costs ${formatMinorToDecimal(line.productionMinor + line.shippingMinor + processingFeeMinor)}, ` +
          `net ${formatMinorToDecimal(royalty.netMinor)}, ` +
          `artist earns ${formatMinorToDecimal(royalty.totalEarningsMinor)} ${royalty.currency} ` +
          `at ${royalty.royaltyTierPercent}%`
      );

      await store.updateArtworkLastSaleDate(line.artwork.id, new Date());
    } catch (error) {
      console.error(`Error recording line item ${line.lineItem.id}:`, error);
    }
  }

  // Held lines are recorded so the revenue is not lost, but with no sale row —
  // nothing is owed until a human resolves the cost.
  for (let i = 0; i < held.length; i++) {
    const line = held[i];
    const processingFeeMinor = feeShares[costed.length + i];

    try {
      await store.createOrder({
        shopifyOrderId: shopifyOrder.id.toString(),
        shopifyLineItemId: line.lineItem.id.toString(),
        artworkId: line.artwork.id,
        artistId: line.artist.id,
        productPrice: formatMinorToDecimal(line.grossMinor),
        printifyCost: "0",
        shippingCost: "0",
        profit: "0",
        currency: orderCurrency,
        grossMinor: line.grossMinor,
        processingFeeMinor,
        costResolutionError: line.reason,
        utmSource: utmParams?.utmSource || null,
        utmMedium: utmParams?.utmMedium || null,
        utmCampaign: utmParams?.utmCampaign || null,
        referralArtistId: referralArtist?.id || null,
        referralBonus: false,
        status: "needs_review",
      } as any);

      console.warn(
        `Line ${line.lineItem.id} held for review — no royalty calculated: ${line.reason}`
      );
    } catch (error) {
      console.error(`Failed to record held line ${line.lineItem.id}:`, error);
    }
  }

  return { processed: costed.length, heldForReview: held.length, skipped };
}
