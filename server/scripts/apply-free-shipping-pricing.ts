/**
 * Apply Free Shipping Pricing Model
 * Updates Shopify products with competitive free shipping prices
 * Competitive positioning: Displate ($44-110), Society6 ($20-150)
 */

import "dotenv/config";

const shopifyShopUrl = process.env.SHOPIFY_SHOP_URL || "";
const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || "";
const apiVersion = "2025-01";

/**
 * Free Shipping Pricing Strategy
 * All prices include shipping baked in for better conversion rates
 */
const PRICING_MATRIX: Record<string, Record<string, number>> = {
  // Paper Posters: $29-49 (competitive with Redbubble $14-17)
  "Paper": {
    "8x10": 29,
    "11x14": 35,
    "12x16": 39,
    "16x20": 42,
    "18x24": 45,
    "24x36": 49,
  },
  // Canvas: $49-79 (competitive with Society6 $40-80)
  "Canvas": {
    "8x10": 49,
    "11x14": 55,
    "12x16": 59,
    "16x20": 65,
    "18x24": 69,
    "24x36": 79,
  },
  // Metal: $59-129 (competitive with Displate $44-110)
  "Metal": {
    "8x10": 59,
    "11x14": 69,
    "12x16": 79,
    "16x20": 89,
    "18x24": 99,
    "24x36": 129,
  },
  // Framed (all colors): $59-99 (competitive positioning)
  "Framed-Black": {
    "8x10": 59,
    "11x14": 65,
    "12x16": 69,
    "16x20": 79,
    "18x24": 85,
    "24x36": 99,
  },
  "Framed-White": {
    "8x10": 59,
    "11x14": 65,
    "12x16": 69,
    "16x20": 79,
    "18x24": 85,
    "24x36": 99,
  },
  "Framed-Walnut": {
    "8x10": 59,
    "11x14": 65,
    "12x16": 69,
    "16x20": 79,
    "18x24": 85,
    "24x36": 99,
  },
};

interface ProductVariant {
  id: string;
  option1: string; // Size
  option2: string; // Finish
  price: string;
}

async function getAllProducts(): Promise<any[]> {
  const products: any[] = [];
  let url: string | null = `https://${shopifyShopUrl}/admin/api/${apiVersion}/products.json?limit=250&status=active`;

  while (url) {
    const response = await fetch(url, {
      headers: { "X-Shopify-Access-Token": shopifyAccessToken },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch products: ${response.statusText}`);
    }

    const data = await response.json();
    products.push(...(data.products || []));

    const linkHeader = response.headers.get("Link");
    url = linkHeader?.match(/<([^>]+)>;\s*rel="next"/)?.[1] || null;
  }

  return products;
}

async function updateProductVariants(productId: string, variants: ProductVariant[]): Promise<boolean> {
  const url = `https://${shopifyShopUrl}/admin/api/${apiVersion}/products/${productId}.json`;

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": shopifyAccessToken,
    },
    body: JSON.stringify({
      product: {
        variants: variants.map(v => ({
          id: v.id,
          price: v.price,
        })),
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`   ❌ Failed to update product ${productId}:`, error);
    return false;
  }

  return true;
}

async function applyFreeShippingPricing() {
  console.log("\n💰 Applying Free Shipping Pricing Model\n");
  console.log("=".repeat(80));
  console.log("\n📊 PRICING STRATEGY (Shipping Included):");
  console.log("  • Paper Posters: $29-49 (vs Redbubble $14-17)");
  console.log("  • Canvas Prints: $49-79 (vs Society6 $40-80)");
  console.log("  • Metal Prints: $59-129 (vs Displate $44-110)");
  console.log("  • Framed Prints: $59-99 (competitive positioning)");
  console.log("\n" + "=".repeat(80));

  if (!shopifyShopUrl || !shopifyAccessToken) {
    console.log("❌ Shopify not configured");
    return;
  }

  console.log("\n📥 Fetching all products...");
  const products = await getAllProducts();
  console.log(`   ✓ Found ${products.length} products\n`);

  let updated = 0;
  let failed = 0;
  let totalVariantsUpdated = 0;

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    
    // Skip non-art products
    if (!product.product_type?.includes("Art") && !product.tags?.includes("art-print")) {
      continue;
    }

    console.log(`\n[${i + 1}/${products.length}] ${product.title}`);
    console.log(`   Product ID: ${product.id}`);
    console.log(`   Current variants: ${product.variants?.length || 0}`);

    const updatedVariants: ProductVariant[] = [];

    for (const variant of product.variants || []) {
      const size = variant.option1; // Size (e.g., "8x10")
      const finish = variant.option2; // Finish (e.g., "Paper", "Metal")
      
      if (!size || !finish) {
        console.log(`   ⚠️  Skipping variant ${variant.id} - missing size or finish`);
        continue;
      }

      // Look up the new price
      const newPrice = PRICING_MATRIX[finish]?.[size];

      if (!newPrice) {
        console.log(`   ⚠️  No pricing found for ${size} / ${finish} - keeping current price $${variant.price}`);
        continue;
      }

      const currentPrice = parseFloat(variant.price || "0");
      const priceChange = newPrice - currentPrice;
      const changeSymbol = priceChange > 0 ? "📈" : priceChange < 0 ? "📉" : "➡️";

      console.log(`   ${changeSymbol} ${size} / ${finish}: $${currentPrice} → $${newPrice} (${priceChange >= 0 ? '+' : ''}$${priceChange.toFixed(2)})`);

      updatedVariants.push({
        id: variant.id,
        option1: size,
        option2: finish,
        price: newPrice.toString(),
      });
    }

    if (updatedVariants.length === 0) {
      console.log(`   ℹ️  No variants to update`);
      continue;
    }

    try {
      const success = await updateProductVariants(product.id, updatedVariants);
      if (success) {
        updated++;
        totalVariantsUpdated += updatedVariants.length;
        console.log(`   ✓ Updated ${updatedVariants.length} variants successfully`);
      } else {
        failed++;
      }
    } catch (error: any) {
      failed++;
      console.log(`   ❌ Error: ${error.message}`);
    }

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log("\n" + "=".repeat(80));
  console.log("📊 UPDATE SUMMARY");
  console.log("=".repeat(80));
  console.log(`   Total products processed: ${products.length}`);
  console.log(`   ✓ Products updated: ${updated}`);
  console.log(`   ✓ Variants updated: ${totalVariantsUpdated}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log("\n" + "=".repeat(80));
  console.log("✅ PRICING UPDATE COMPLETE");
  console.log("=".repeat(80));
}

applyFreeShippingPricing()
  .then(() => {
    console.log("\n✅ Free shipping pricing applied successfully!\n");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Pricing update failed:", error);
    process.exit(1);
  });
