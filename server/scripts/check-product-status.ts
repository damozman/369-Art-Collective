import dotenv from "dotenv";
dotenv.config();

const SHOPIFY_SHOP = process.env.SHOPIFY_SHOP_URL!.replace(/^https?:\/\//, '').replace(/\/$/, '');
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN!;

async function checkProducts() {
  console.log("🔍 Checking Product Status & Sales Channels\n");
  
  // Get first 10 products to check status
  const response = await fetch(
    `https://${SHOPIFY_SHOP}/admin/api/2025-01/products.json?limit=10&fields=id,title,handle,status,published_at`,
    {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    console.error("❌ Error fetching products:", response.statusText);
    return;
  }

  const data = await response.json();
  console.log(`📦 Total products in response: ${data.products?.length || 0}\n`);

  if (data.products && data.products.length > 0) {
    console.log("Product Status Breakdown:\n");
    
    for (const product of data.products) {
      const statusIcon = product.status === "active" ? "✅" : "❌";
      const publishedIcon = product.published_at ? "🌐" : "🔒";
      
      console.log(`${statusIcon} ${publishedIcon} ${product.title}`);
      console.log(`   Handle: ${product.handle}`);
      console.log(`   Status: ${product.status}`);
      console.log(`   Published: ${product.published_at || "NOT PUBLISHED"}`);
      console.log("");
    }
    
    console.log("\nLegend:");
    console.log("✅ = Active status");
    console.log("🌐 = Published to Online Store");
    console.log("🔒 = NOT published to Online Store");
  } else {
    console.log("❌ No products found in Shopify!");
  }
}

checkProducts();
