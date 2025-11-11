import "dotenv/config";

const shopifyShopUrl = process.env.SHOPIFY_SHOP_URL || "";
const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || "";
const apiVersion = "2025-01";

/**
 * This script updates all Shopify products to align with Printify's actual wall art options:
 * - Posters (Matte paper prints)
 * - Canvas (Stretched canvas)
 * - Framed Prints (Framed posters)
 * - Metal Prints (Metal art signs)
 */

interface ProductVariant {
  id?: string;
  title: string;
  option1: string; // Size
  option2: string; // Finish
  price: string;
  sku?: string;
}

const SIZES = ["8x10", "11x14", "12x16", "16x20", "18x24", "24x36"];
const FINISHES = {
  Poster: { name: "Poster", tag: "Finish:Poster", basePrice: 19 },
  Canvas: { name: "Canvas", tag: "Finish:Canvas", basePrice: 39 },
  Framed: { name: "Framed", tag: "Finish:Framed", basePrice: 49 },
  Metal: { name: "Metal", tag: "Finish:Metal", basePrice: 59 },
};

// Price multipliers by size
const SIZE_MULTIPLIERS: Record<string, number> = {
  "8x10": 1.0,
  "11x14": 1.3,
  "12x16": 1.5,
  "16x20": 2.0,
  "18x24": 2.5,
  "24x36": 4.0,
};

function calculatePrice(finishName: keyof typeof FINISHES, size: string): number {
  const basePrice = FINISHES[finishName].basePrice;
  const multiplier = SIZE_MULTIPLIERS[size] || 1;
  return Math.round(basePrice * multiplier);
}

async function getAllProducts(): Promise<any[]> {
  const products: any[] = [];
  let url: string | null = `https://${shopifyShopUrl}/admin/api/${apiVersion}/products.json?limit=250&status=active`;

  while (url) {
    const response: Response = await fetch(url, {
      headers: { "X-Shopify-Access-Token": shopifyAccessToken },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch products: ${response.statusText}`);
    }

    const data = await response.json();
    products.push(...(data.products || []));

    const linkHeader: string | null = response.headers.get("Link");
    url = linkHeader?.match(/<([^>]+)>;\s*rel="next"/)?.[1] || null;
  }

  return products;
}

async function updateProduct(productId: string, updateData: any): Promise<boolean> {
  const url = `https://${shopifyShopUrl}/admin/api/${apiVersion}/products/${productId}.json`;

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": shopifyAccessToken,
    },
    body: JSON.stringify({ product: updateData }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`   ❌ Failed to update product ${productId}:`, error);
    return false;
  }

  return true;
}

async function updateAllProducts() {
  console.log("\n🎨 Updating Products with Printify-Aligned Finishes\n");
  console.log("=".repeat(60));
  console.log("\nNew finish options:");
  console.log("  • Poster (Matte paper) - $19-76");
  console.log("  • Canvas (Stretched) - $39-156");
  console.log("  • Framed (Framed posters) - $49-196");
  console.log("  • Metal (Metal art signs) - $59-236");
  console.log("\n" + "=".repeat(60));

  if (!shopifyShopUrl || !shopifyAccessToken) {
    console.log("❌ Shopify not configured");
    return;
  }

  console.log("\n📥 Fetching all products...");
  const products = await getAllProducts();
  console.log(`   ✓ Found ${products.length} products\n`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    console.log(`\n[${i + 1}/${products.length}] ${product.title}`);
    console.log(`   Product ID: ${product.id}`);
    console.log(`   Current variants: ${product.variants?.length || 0}`);

    // Generate new variants with all 4 finishes
    const newVariants: ProductVariant[] = [];
    
    for (const size of SIZES) {
      for (const [finishKey, finishData] of Object.entries(FINISHES)) {
        newVariants.push({
          title: `${size} / ${finishData.name}`,
          option1: size,
          option2: finishData.name,
          price: calculatePrice(finishKey as keyof typeof FINISHES, size).toString(),
          sku: `${product.id}-${size}-${finishKey}`.toLowerCase(),
        });
      }
    }

    console.log(`   New variants: ${newVariants.length} (${SIZES.length} sizes × 4 finishes)`);

    // Update tags to include all finish types
    const existingTags = (product.tags || "").split(",").map((t: string) => t.trim()).filter((t: string) => t);
    const nonFinishTags = existingTags.filter((t: string) => !t.startsWith("Finish:"));
    const newTags = [
      ...nonFinishTags,
      ...Object.values(FINISHES).map(f => f.tag),
    ];

    const updateData = {
      options: [
        { name: "Size", position: 1, values: SIZES },
        { name: "Finish", position: 2, values: Object.values(FINISHES).map(f => f.name) },
      ],
      variants: newVariants,
      tags: newTags.join(", "),
    };

    try {
      const success = await updateProduct(product.id, updateData);
      if (success) {
        updated++;
        console.log(`   ✓ Updated successfully`);
      } else {
        failed++;
        console.log(`   ❌ Update failed`);
      }
    } catch (error: any) {
      failed++;
      console.log(`   ❌ Error: ${error.message}`);
    }

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log("\n" + "=".repeat(60));
  console.log("📊 UPDATE SUMMARY");
  console.log("=".repeat(60));
  console.log(`   Total products: ${products.length}`);
  console.log(`   ✓ Updated: ${updated}`);
  console.log(`   ⚠️  Skipped: ${skipped}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log("\n" + "=".repeat(60));
  console.log("✅ COMPLETE");
  console.log("=".repeat(60) + "\n");
}

updateAllProducts()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
