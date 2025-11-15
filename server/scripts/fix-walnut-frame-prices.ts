const shopifyShopUrl = process.env.SHOPIFY_SHOP_URL || '';
const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || '';

const FRAME_UPCHARGE = 29.00; // Additional cost for frames

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

async function fixWalnutFramePrices() {
  console.log('🔧 Starting Walnut Frame Price Fix...\n');

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
      console.log(`\n📝 [${processedCount}/${products.length}] Processing: ${product.title}`);
      
      // Find all Framed-Walnut variants
      const walnutVariants = product.variants.filter((variant: any) => {
        const title = variant.title || '';
        const option2 = variant.option2 || '';
        const option3 = variant.option3 || '';
        
        return title.includes('Framed-Walnut') || 
               option2 === 'Framed-Walnut' || 
               option3 === 'Framed-Walnut';
      });

      if (walnutVariants.length === 0) {
        console.log('  ⏭️  No Framed-Walnut variants found');
        continue;
      }

      console.log(`  🔍 Found ${walnutVariants.length} Framed-Walnut variants`);

      // Find base price from Paper variant (same size)
      for (const walnutVariant of walnutVariants) {
        try {
          // Extract size from variant
          const size = walnutVariant.option1 || walnutVariant.title.split(' / ')[0];
          
          // Find corresponding Paper variant to get base price
          const paperVariant = product.variants.find((v: any) => {
            const vSize = v.option1 || v.title.split(' / ')[0];
            const vFinish = v.option2 || v.title.split(' / ')[1];
            return vSize === size && vFinish === 'Paper';
          });

          if (!paperVariant) {
            console.log(`  ⚠️  Could not find Paper variant for size ${size}, skipping`);
            continue;
          }

          const basePrice = parseFloat(paperVariant.price);
          const correctPrice = (basePrice + FRAME_UPCHARGE).toFixed(2);
          const currentPrice = parseFloat(walnutVariant.price);

          // Check if price needs updating
          if (Math.abs(currentPrice - parseFloat(correctPrice)) < 0.01) {
            console.log(`  ✓ ${walnutVariant.title}: Already correct ($${correctPrice})`);
            continue;
          }

          console.log(`  🔄 ${walnutVariant.title}:`);
          console.log(`     Current: $${currentPrice}`);
          console.log(`     Updating to: $${correctPrice} (base $${basePrice} + $${FRAME_UPCHARGE})`);

          // Update the variant price
          await shopifyFetch(`/variants/${walnutVariant.id}.json`, {
            method: 'PUT',
            body: JSON.stringify({
              variant: {
                id: walnutVariant.id,
                price: correctPrice
              }
            })
          });

          console.log(`  ✅ Updated successfully!`);
          updatedCount++;

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 150));

        } catch (error: any) {
          console.error(`  ❌ Error updating variant ${walnutVariant.title}:`, error.message);
          errorCount++;
        }
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Summary:');
    console.log(`   ✅ Successfully updated: ${updatedCount} variants`);
    console.log(`   ❌ Errors: ${errorCount} variants`);
    console.log('='.repeat(60));

    if (updatedCount > 0) {
      console.log('\n✨ Walnut frame prices have been fixed!');
      console.log('🧪 Test on live site:');
      console.log('   1. Visit any product page');
      console.log('   2. Select Paper finish');
      console.log('   3. Select Walnut Frame');
      console.log('   4. Price should increase by $29');
    }

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    throw error;
  }
}

// Run the script
fixWalnutFramePrices()
  .then(() => {
    console.log('\n✅ Script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
