import "dotenv/config";

const shopifyShopUrl = process.env.SHOPIFY_SHOP_URL || "";
const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || "";
const apiVersion = "2025-01";

interface Product {
  id: string;
  title: string;
  tags: string;
}

async function getAllProducts(): Promise<Product[]> {
  const products: Product[] = [];
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

    const linkHeader: string | null = response.headers.get('Link');
    url = linkHeader?.match(/<([^>]+)>;\s*rel="next"/)?.[1] || null;
  }
  
  return products;
}

async function updateProductTags(productId: string, newTags: string): Promise<boolean> {
  const url = `https://${shopifyShopUrl}/admin/api/${apiVersion}/products/${productId}.json`;
  
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": shopifyAccessToken,
    },
    body: JSON.stringify({
      product: {
        id: productId,
        tags: newTags,
      },
    }),
  });

  return response.ok;
}

async function main() {
  console.log("\n🏷️  Adding 'wall-art' Tag to All Products\n");
  console.log("=".repeat(60));
  console.log("\nThis tag enables compound filtering in smart collections.");
  console.log("Collections will require: Finish tag AND wall-art tag\n");
  console.log("=".repeat(60) + "\n");

  if (!shopifyShopUrl || !shopifyAccessToken) {
    console.log("❌ Shopify not configured");
    return;
  }

  console.log("📥 Fetching all products...");
  const products = await getAllProducts();
  console.log(`   ✓ Found ${products.length} products\n`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    console.log(`\n[${i + 1}/${products.length}] ${product.title}`);
    
    const existingTags = product.tags.split(",").map(t => t.trim()).filter(t => t);
    
    // Check if already has wall-art tag
    if (existingTags.some(t => t.toLowerCase() === "wall-art")) {
      console.log(`   ✓ Already has 'wall-art' tag - skipping`);
      skipped++;
      continue;
    }

    // Add wall-art tag
    const newTags = [...existingTags, "wall-art"];
    console.log(`   Adding 'wall-art' tag...`);
    
    try {
      const success = await updateProductTags(product.id, newTags.join(", "));
      
      if (success) {
        updated++;
        console.log(`   ✅ Updated successfully`);
      } else {
        failed++;
        console.log(`   ❌ Update failed`);
      }
    } catch (error: any) {
      failed++;
      console.log(`   ❌ Error: ${error.message}`);
    }

    // Rate limiting: 2 requests per second
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log("\n" + "=".repeat(60));
  console.log("✅ TAG UPDATE COMPLETE");
  console.log("=".repeat(60) + "\n");

  console.log("📊 Summary:");
  console.log(`   Updated: ${updated}`);
  console.log(`   Skipped: ${skipped} (already had tag)`);
  console.log(`   Failed: ${failed}\n`);

  if (updated > 0) {
    console.log("🎉 Your products now have the 'wall-art' tag!");
    console.log("\nNext step: Smart collections will now populate with products.");
    console.log("Shopify may take a few moments to reindex.\n");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
