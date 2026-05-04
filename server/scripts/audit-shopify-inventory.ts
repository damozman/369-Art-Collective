/**
 * Audit Shopify Inventory
 * Checks which wall art products exist and which are missing
 */

import { getAllProducts, isShopifyConfigured } from '../lib/shopify';

interface ProductInventory {
  found: Array<{
    title: string;
    handle: string;
    variants: Array<{
      size: string;
      finish: string;
      price: string;
    }>;
  }>;
  missing: string[];
}

async function auditInventory() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║     SHOPIFY INVENTORY AUDIT                   ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  if (!isShopifyConfigured()) {
    console.error('❌ Shopify not configured');
    return;
  }

  console.log('🔍 Fetching all products from Shopify...\n');
  
  const products = await getAllProducts();
  console.log(`✅ Found ${products.length} total products\n`);

  // Expected product structure: 12 variants per artwork
  // Sizes: 8x10, 18x24, 24x36
  // Finishes: Paper, Canvas, Metal, Framed-Black, Framed-White, Framed-Walnut
  
  const expectedFinishes = ['Paper', 'Canvas', 'Metal', 'Framed-Black', 'Framed-White', 'Framed-Walnut'];
  const expectedSizes = ['8x10', '18x24', '24x36'];
  
  const inventory: ProductInventory = {
    found: [],
    missing: []
  };

  // Analyze each product
  for (const product of products) {
    if (!product.product_type?.includes('Art') && !product.tags?.includes('art-print')) {
      continue; // Skip non-art products
    }

    const variants = product.variants?.map((v: any) => ({
      size: v.option1 || 'unknown',
      finish: v.option2 || 'unknown',
      price: v.price || '0'
    })) || [];

    inventory.found.push({
      title: product.title || 'Untitled',
      handle: product.handle || 'unknown',
      variants
    });
  }

  // Display findings
  console.log('═'.repeat(80));
  console.log('📦 CURRENT INVENTORY\n');
  console.log('═'.repeat(80));

  // Group by finish type
  const finishCounts = new Map<string, number>();
  
  for (const product of inventory.found) {
    console.log(`\n🎨 ${product.title}`);
    console.log(`   Handle: ${product.handle}`);
    console.log(`   Variants: ${product.variants.length}`);
    
    const finishesFound = new Set(product.variants.map(v => v.finish));
    console.log(`   Finishes: ${Array.from(finishesFound).join(', ')}`);
    
    // Track finish counts
    for (const finish of finishesFound) {
      finishCounts.set(finish, (finishCounts.get(finish) || 0) + 1);
    }
  }

  console.log('\n' + '═'.repeat(80));
  console.log('📊 FINISH AVAILABILITY\n');
  console.log('═'.repeat(80));

  for (const finish of expectedFinishes) {
    const count = finishCounts.get(finish) || 0;
    const status = count > 0 ? '✅' : '❌';
    console.log(`${status} ${finish.padEnd(20)} - ${count} products`);
    
    if (count === 0) {
      inventory.missing.push(finish);
    }
  }

  console.log('\n' + '═'.repeat(80));
  console.log('🔍 ANALYSIS\n');
  console.log('═'.repeat(80));

  if (inventory.missing.length === 0) {
    console.log('✅ All expected finishes are available!');
  } else {
    console.log(`❌ Missing finishes: ${inventory.missing.join(', ')}`);
    console.log('\n💡 RECOMMENDATION:');
    console.log('   Run the product creation script to add missing variants');
  }

  console.log('\n' + '═'.repeat(80));
  
  return inventory;
}

auditInventory()
  .then(() => {
    console.log('\n✅ Audit complete!\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Audit failed:', error);
    process.exit(1);
  });
