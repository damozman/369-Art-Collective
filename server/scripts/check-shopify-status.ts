import "dotenv/config";

const shopifyShopUrl = process.env.SHOPIFY_SHOP_URL || "";
const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || "";

async function checkShopifyStatus() {
  console.log("\n🔍 Checking Shopify Status\n");
  console.log("=".repeat(60));

  if (!shopifyShopUrl || !shopifyAccessToken) {
    console.log("❌ Shopify not configured");
    return;
  }

  const apiVersion = "2025-01";

  // 1. Check products
  console.log("\n📦 PRODUCTS:");
  try {
    const productsUrl = `https://${shopifyShopUrl}/admin/api/${apiVersion}/products.json?limit=5&status=active`;
    const productsResponse = await fetch(productsUrl, {
      headers: { "X-Shopify-Access-Token": shopifyAccessToken },
    });
    
    if (productsResponse.ok) {
      const productsData = await productsResponse.json();
      console.log(`   Found ${productsData.products?.length || 0} active products (showing first 5)`);
      
      if (productsData.products && productsData.products.length > 0) {
        const product = productsData.products[0];
        console.log(`\n   Sample Product: "${product.title}"`);
        console.log(`   - Product Type: ${product.product_type}`);
        console.log(`   - Tags: ${product.tags}`);
        console.log(`   - Variants: ${product.variants?.length || 0}`);
        if (product.variants && product.variants.length > 0) {
          const variant = product.variants[0];
          console.log(`   - Sample Variant: ${variant.title}`);
          console.log(`   - Options: ${JSON.stringify(product.options)}`);
        }
      }
    }
  } catch (error: any) {
    console.log(`   Error: ${error.message}`);
  }

  // 2. Check collections
  console.log("\n\n📁 COLLECTIONS:");
  try {
    // Check both custom and smart collections
    const collectionsUrl = `https://${shopifyShopUrl}/admin/api/${apiVersion}/custom_collections.json?limit=250`;
    const collectionsResponse = await fetch(collectionsUrl, {
      headers: { "X-Shopify-Access-Token": shopifyAccessToken },
    });

    if (collectionsResponse.ok) {
      const collectionsData = await collectionsResponse.json();
      console.log(`   Found ${collectionsData.custom_collections?.length || 0} custom collections\n`);
      
      // Check specific collections we care about
      const targetCollections = ["Featured", "New Arrivals", "Metal Prints", "Canvas Prints", "Posters", "Framed Prints"];
      
      for (const targetTitle of targetCollections) {
        const collection = collectionsData.custom_collections?.find(
          (c: any) => c.title.toLowerCase() === targetTitle.toLowerCase()
        );
        
        if (collection) {
          // Get product count
          const collectsUrl = `https://${shopifyShopUrl}/admin/api/${apiVersion}/collects.json?collection_id=${collection.id}&limit=1`;
          const collectsResponse = await fetch(collectsUrl, {
            headers: { "X-Shopify-Access-Token": shopifyAccessToken },
          });
          
          if (collectsResponse.ok) {
            const collectsData = await collectsResponse.json();
            const count = collectsData.collects?.length || 0;
            console.log(`   ✓ ${targetTitle}: ${count} products (ID: ${collection.id})`);
          }
        } else {
          console.log(`   ✗ ${targetTitle}: NOT FOUND`);
        }
      }
    }
  } catch (error: any) {
    console.log(`   Error: ${error.message}`);
  }

  // 3. Check smart collections
  console.log("\n\n🤖 SMART COLLECTIONS:");
  try {
    const smartCollectionsUrl = `https://${shopifyShopUrl}/admin/api/${apiVersion}/smart_collections.json?limit=250`;
    const smartResponse = await fetch(smartCollectionsUrl, {
      headers: { "X-Shopify-Access-Token": shopifyAccessToken },
    });

    if (smartResponse.ok) {
      const smartData = await smartResponse.json();
      console.log(`   Found ${smartData.smart_collections?.length || 0} smart collections`);
      
      if (smartData.smart_collections && smartData.smart_collections.length > 0) {
        smartData.smart_collections.slice(0, 5).forEach((c: any) => {
          console.log(`   - ${c.title}: ${c.rules?.length || 0} rules`);
        });
      }
    }
  } catch (error: any) {
    console.log(`   Error: ${error.message}`);
  }

  console.log("\n" + "=".repeat(60) + "\n");
}

checkShopifyStatus()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
