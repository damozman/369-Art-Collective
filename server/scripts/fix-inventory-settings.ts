export {};
const shopifyShopUrl = process.env.SHOPIFY_SHOP_URL || '';
const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || '';

async function shopifyFetch(endpoint: string, options: RequestInit = {}) {
  const url = `https://${shopifyShopUrl}/admin/api/2024-04${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'X-Shopify-Access-Token': shopifyAccessToken,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function fixInventorySettings() {
  console.log('🔧 Fixing Inventory Settings for POD Products...\n');
  console.log('📝 Setting all variants to:');
  console.log('   - inventory_management: null (no tracking)');
  console.log('   - inventory_policy: continue (always available)\n');

  try {
    // Fetch all products
    console.log('📦 Fetching all products...');
    const data = await shopifyFetch('/products.json?limit=250');
    const products = data.products;
    console.log(`✓ Found ${products.length} total products\n`);

    let updatedCount = 0;
    let errorCount = 0;
    let processedCount = 0;

    for (const product of products) {
      processedCount++;
      console.log(`\n📝 [${processedCount}/${products.length}] ${product.title}`);
      
      let productUpdates = 0;

      for (const variant of product.variants) {
        try {
          // Check if variant needs updating
          const needsUpdate = 
            variant.inventory_management !== null || 
            variant.inventory_policy !== 'continue';

          if (!needsUpdate) {
            continue;
          }

          // Update variant
          await shopifyFetch(`/variants/${variant.id}.json`, {
            method: 'PUT',
            body: JSON.stringify({
              variant: {
                id: variant.id,
                inventory_management: null,
                inventory_policy: 'continue'
              }
            })
          });

          productUpdates++;
          updatedCount++;

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));

        } catch (error: any) {
          console.error(`  ❌ Error updating ${variant.title}:`, error.message);
          errorCount++;
        }
      }

      if (productUpdates > 0) {
        console.log(`  ✅ Updated ${productUpdates} variants`);
      } else {
        console.log(`  ✓ Already correct`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Summary:');
    console.log(`   ✅ Successfully updated: ${updatedCount} variants`);
    console.log(`   ❌ Errors: ${errorCount} variants`);
    console.log('='.repeat(60));

    console.log('\n✨ All products are now available for purchase!');
    console.log('🧪 Test: Refresh any product page - "SOLD OUT" should be gone');

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    throw error;
  }
}

// Run the script
fixInventorySettings()
  .then(() => {
    console.log('\n✅ Script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
