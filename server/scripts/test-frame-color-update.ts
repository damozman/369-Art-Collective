import "dotenv/config";

const shopifyShopUrl = process.env.SHOPIFY_SHOP_URL || "";
const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || "";
const apiVersion = "2025-01";

/**
 * TEST SCRIPT - Updates only the FIRST product to verify frame color logic
 */

interface ProductVariant {
  id?: string;
  title: string;
  option1: string; // Size
  option2: string; // Finish (including frame colors)
  price: string;
  sku?: string;
}

const SIZES = ["8x10", "11x14", "12x16", "16x20", "18x24", "24x36"];

const FINISHES = {
  Paper: { name: "Paper", tag: "Finish:Paper", basePrice: 19 },
  Canvas: { name: "Canvas", tag: "Finish:Canvas", basePrice: 39 },
  "Framed-Black": { name: "Framed-Black", tag: "Finish:Framed", basePrice: 49 },
  "Framed-White": { name: "Framed-White", tag: "Finish:Framed", basePrice: 49 },
  "Framed-Walnut": { name: "Framed-Walnut", tag: "Finish:Framed", basePrice: 49 },
  Metal: { name: "Metal", tag: "Finish:Metal", basePrice: 59 },
};

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

async function getFirstProduct(): Promise<any> {
  const url = `https://${shopifyShopUrl}/admin/api/${apiVersion}/products.json?limit=1&status=active`;
  const response = await fetch(url, {
    headers: { "X-Shopify-Access-Token": shopifyAccessToken },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch products: ${response.statusText}`);
  }

  const data = await response.json();
  return data.products?.[0];
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
    console.error(`Failed to update product:`, error);
    return false;
  }

  return true;
}

async function testUpdate() {
  console.log("\n🧪 TESTING Frame Color Update on First Product\n");
  console.log("=".repeat(60));

  if (!shopifyShopUrl || !shopifyAccessToken) {
    console.log("❌ Shopify not configured");
    return;
  }

  console.log("\n📥 Fetching first product...");
  const product = await getFirstProduct();
  
  if (!product) {
    console.log("❌ No products found");
    return;
  }

  console.log(`\n📦 Product: ${product.title}`);
  console.log(`   ID: ${product.id}`);
  console.log(`   Current options:`, product.options.map((o: any) => o.name).join(", "));
  console.log(`   Current variants: ${product.variants?.length || 0}`);
  console.log(`   Current finishes: ${[...new Set(product.variants.map((v: any) => v.option2))].join(", ")}`);

  // Generate new variants
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

  console.log(`\n📊 Proposed Update:`);
  console.log(`   New variants: ${newVariants.length} (${SIZES.length} sizes × ${Object.keys(FINISHES).length} finishes)`);
  console.log(`   New finishes: ${Object.values(FINISHES).map(f => f.name).join(", ")}`);
  
  console.log(`\n   Sample variants:`);
  console.log(`   - ${newVariants[0].title} ($${newVariants[0].price})`);
  console.log(`   - ${newVariants[12].title} ($${newVariants[12].price})`); // Framed-Black example
  console.log(`   - ${newVariants[24].title} ($${newVariants[24].price})`); // Framed-White example

  const existingTags = (product.tags || "").split(",").map((t: string) => t.trim()).filter((t: string) => t);
  const nonFinishTags = existingTags.filter((t: string) => !t.startsWith("Finish:"));
  const newTags = [
    ...nonFinishTags,
    ...Array.from(new Set(Object.values(FINISHES).map(f => f.tag))),
  ];

  const updateData = {
    options: [
      { name: "Size", position: 1, values: SIZES },
      { name: "Finish", position: 2, values: Object.values(FINISHES).map(f => f.name) },
    ],
    variants: newVariants,
    tags: newTags.join(", "),
  };

  console.log(`\n🔄 Updating product...`);
  const success = await updateProduct(product.id, updateData);
  
  if (success) {
    console.log(`\n✅ TEST SUCCESSFUL!`);
    console.log(`\nVerify at: https://${shopifyShopUrl}/admin/products/${product.id}`);
  } else {
    console.log(`\n❌ TEST FAILED`);
  }

  console.log("\n" + "=".repeat(60) + "\n");
}

testUpdate()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
