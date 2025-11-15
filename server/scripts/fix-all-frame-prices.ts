const shopifyShopUrl = process.env.SHOPIFY_SHOP_URL || '';
const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || '';

const FRAME_UPCHARGE = 29.00; // All frames should have $29 upcharge

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

async function fixAllFramePrices() {
  console.log('🔧 Fixing ALL Frame Prices (Black, White, Walnut)...\n');

  try {
    // Fetch all products
    console.log('📦 Fetching all products...');
    const data = await shopifyFetch('/products.json?limit=250');
    const products = data.products;
    console.log(`✓ Found ${products.length} total products\n`);

    let updatedCount = 0;
    let errorCount = 0;
    let processedCount = 0;

    const frameColors = ['Black', 'White', 'Walnut'];

    for (const product of products) {
      processedCount++;
      console.log(`\n📝 [${processedCount}/${products.length}] Processing: ${product.title}`);
      
      // Find all Framed-* variants
      const framedVariants = product.variants.filter((variant: any) => {
        const title = variant.title || '';
        const option2 = variant.option2 || '';
        
        return frameColors.some(color => 
          title.includes(`Framed-${color}`) || option2 === `Framed-${color}`
        );
      });

      if (framedVariants.length === 0) {
        console.log('  ⏭️  No framed variants found');
        continue;
      }

      console.log(`  🔍 Found ${framedVariants.length} framed variants`);

      // Process each framed variant
      for (const framedVariant of framedVariants) {
        try {
          // Extract size from variant
          const size = framedVariant.option1 || framedVariant.title.split(' / ')[0];
          
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
          const currentPrice = parseFloat(framedVariant.price);

          // Check if price needs updating
          if (Math.abs(currentPrice - parseFloat(correctPrice)) < 0.01) {
            console.log(`  ✓ ${framedVariant.title}: Already correct ($${correctPrice})`);
            continue;
          }

          console.log(`  🔄 ${framedVariant.title}:`);
          console.log(`     Current: $${currentPrice}`);
          console.log(`     Updating to: $${correctPrice} (base $${basePrice} + $${FRAME_UPCHARGE})`);

          // Update the variant price
          await shopifyFetch(`/variants/${framedVariant.id}.json`, {
            method: 'PUT',
            body: JSON.stringify({
              variant: {
                id: framedVariant.id,
                price: correctPrice
              }
            })
          });

          console.log(`  ✅ Updated successfully!`);
          updatedCount++;

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 150));

        } catch (error: any) {
          console.error(`  ❌ Error updating variant ${framedVariant.title}:`, error.message);
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
      console.log('\n✨ ALL frame prices have been standardized to $29 upcharge!');
      console.log('🧪 Test on live site:');
      console.log('   All frame colors (Black, White, Walnut) now cost +$29');
    }

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    throw error;
  }
}

// Run the script
fixAllFramePrices()
  .then(() => {
    console.log('\n✅ Script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
