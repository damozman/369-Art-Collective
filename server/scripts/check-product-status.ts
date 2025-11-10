import dotenv from "dotenv";
dotenv.config();

const SHOPIFY_SHOP = process.env.SHOPIFY_SHOP_URL!.replace(/^https?:\/\//, '').replace(/\/$/, '');
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN!;

async function checkProducts() {
  console.log("🔍 Checking Product Status in Shopify\n");
  
  // Get first 10 products to check status
  const response = await fetch(
    `https://${SHOPIFY_SHOP}/admin/api/2024-01/products.json?limit=10`,
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
    data.products.forEach((product: any, i: number) => {
      console.log(`${i + 1}. ${product.title}`);
      console.log(`   Status: ${product.status}`);
      console.log(`   Published: ${product.published_at ? 'Yes ✅' : 'No ❌'}`);
      console.log(`   Variants: ${product.variants?.length || 0}`);
      console.log("");
    });
  } else {
    console.log("❌ No products found in Shopify!");
  }
}

checkProducts();
