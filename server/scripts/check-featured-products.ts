import "dotenv/config";

const shopifyShopUrl = process.env.SHOPIFY_SHOP_URL || "";
const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || "";
const apiVersion = "2025-01";

async function checkProducts() {
  const collectionId = "497752998185"; // Correct Featured collection ID
  const url = `https://${shopifyShopUrl}/admin/api/${apiVersion}/collections/${collectionId}/products.json`;
  
  const response = await fetch(url, {
    headers: { "X-Shopify-Access-Token": shopifyAccessToken },
  });
  
  if (!response.ok) {
    console.error("❌ Failed to fetch products");
    process.exit(1);
  }
  
  const data = await response.json();
  const products = data.products || [];
  
  console.log("\n📋 Featured Collection Products:\n");
  console.log("=".repeat(80));
  
  for (const product of products) {
    console.log(`\n✨ ${product.title}`);
    console.log(`   Product Type: "${product.product_type}"`);
    console.log(`   Vendor: ${product.vendor}`);
    
    // Check if it matches the Liquid filter
    const productType = (product.product_type || "").toLowerCase();
    const matches = productType.includes("poster") || 
                   productType.includes("canvas") || 
                   productType.includes("framed print") || 
                   productType.includes("metal sign");
    console.log(`   ✓ Matches Slider Filter: ${matches ? "YES ✅" : "NO ❌"}`);
  }
  
  console.log("\n" + "=".repeat(80));
  
  const validProducts = products.filter((p: any) => {
    const productType = (p.product_type || "").toLowerCase();
    return productType.includes("poster") || 
           productType.includes("canvas") || 
           productType.includes("framed print") || 
           productType.includes("metal sign");
  });
  
  console.log(`\n✅ Valid for slider: ${validProducts.length}/${products.length} products\n`);
  
  if (validProducts.length < 2) {
    console.log("❌ SLIDER INACTIVE: Need 2+ products with matching product_type");
    console.log("\n💡 FIX: Set product_type to one of: poster, canvas, framed print, metal sign\n");
  } else {
    console.log("🎉 SLIDER SHOULD BE ACTIVE (2+ valid products)!\n");
  }
}

checkProducts().catch(console.error);
