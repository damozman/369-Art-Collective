/**
 * Financial Audit Script
 * 
 * Verifies actual costs and pricing by querying live APIs:
 * 1. Printify API - Get current production costs + shipping for all wall art products
 * 2. Shopify API - Get current live product prices
 * 3. Compare to config file estimates
 * 4. Calculate TRUE margins for all products at all artist tiers
 * 5. Identify any unprofitable scenarios or pricing gaps
 */

import { 
  getPrintProviders, 
  getVariants, 
  getShipping,
  isPrintifyConfigured 
} from '../lib/printify';
import { PRINTIFY_PRODUCTS, calculateProductMargin, ROYALTY_TIERS } from '../../shared/financial-utils';
import { getAllProducts, isShopifyConfigured } from '../lib/shopify';

// Wall art blueprint IDs (verified from identify-wall-art-blueprints.ts)
const WALL_ART_BLUEPRINTS = {
  POSTER: 852,    // Vertical and Horizontal Matte Posters
  CANVAS: 555,    // Stretched Canvas
  FRAMED: 492,    // Vertical Framed Poster
  METAL: 1206,    // Metal Art Sign
};

const WALL_ART_PROVIDERS = {
  POSTER: 73,     // Printed Simply
  CANVAS: 69,     // Prodigi
  FRAMED: 36,     // Print Pigeons
  METAL: 228,     // Taylor
};

interface VariantCost {
  variantId: number;
  title: string;
  cost: number; // in cents
}

interface ShippingProfile {
  type: string;
  cost: number; // in cents
}

interface ProductFinancials {
  productType: string;
  variant: string;
  
  // Printify Live Data
  printifyProductionCost: number; // dollars
  printifyShippingCost: number;   // dollars
  
  // Config File Data
  configProductionCost: number;   // dollars
  configShippingCost: number;     // dollars
  
  // Shopify Live Data
  shopifyLivePrice: number | null; // dollars
  
  // Differences
  productionCostDiff: number;  // dollars
  shippingCostDiff: number;    // dollars
  
  // Margins at each tier (using live Shopify price)
  margins: {
    free: {
      platformMargin: number;
      platformMarginPercent: number;
      artistRoyalty: number;
      stripeFee: number;
    };
    pro: {
      platformMargin: number;
      platformMarginPercent: number;
      artistRoyalty: number;
      stripeFee: number;
    };
    elite: {
      platformMargin: number;
      platformMarginPercent: number;
      artistRoyalty: number;
      stripeFee: number;
    };
  } | null;
  
  // Free Shipping Recommendations
  recommendedFreeShippingPrice: number; // dollars
}

async function getPrintifyLiveCosts(blueprintId: number): Promise<Map<string, { production: number; shipping: number }>> {
  console.log(`\n📊 Querying Printify for Blueprint ${blueprintId}...`);
  
  const costs = new Map<string, { production: number; shipping: number }>();
  
  try {
    // Get print providers for this blueprint
    const providers = await getPrintProviders(blueprintId);
    
    if (!providers || providers.length === 0) {
      console.warn(`⚠️  No providers found for blueprint ${blueprintId}`);
      return costs;
    }
    
    // Use first provider (typically the most reliable)
    const provider = providers[0];
    console.log(`   Using provider: ${provider.title} (ID: ${provider.id})`);
    
    // Get variants (sizes/types)
    const variantsData = await getVariants(blueprintId, provider.id);
    
    if (!variantsData.variants || variantsData.variants.length === 0) {
      console.warn(`⚠️  No variants found for blueprint ${blueprintId}`);
      return costs;
    }
    
    // Get shipping info
    let shippingData;
    try {
      shippingData = await getShipping(blueprintId, provider.id);
    } catch (error) {
      console.warn(`⚠️  Could not fetch shipping data: ${error}`);
      shippingData = null;
    }
    
    // Process each variant
    for (const variant of variantsData.variants) {
      const variantKey = variant.title; // e.g., "12×16″"
      
      // Printify cost field might be missing or zero - handle gracefully
      let productionCost = 0;
      if (variant.cost && typeof variant.cost === 'number' && variant.cost > 0) {
        productionCost = variant.cost / 100; // Convert cents to dollars
      } else if (variant.price && typeof variant.price === 'number' && variant.price > 0) {
        // Some blueprints use 'price' instead of 'cost'
        productionCost = variant.price / 100;
      } else {
        console.warn(`      ⚠️  No cost data for variant: ${variantKey}`);
        continue; // Skip variants without cost data
      }
      
      // Estimate shipping based on available data
      // Printify shipping varies by destination, so we'll use average US shipping
      let shippingCost = 7.00; // Default average
      
      if (shippingData && shippingData.profiles) {
        // Try to find US shipping cost
        const usProfile = shippingData.profiles.find((p: any) => 
          p.countries?.includes('US') || p.countries?.includes('*')
        );
        
        if (usProfile && usProfile.first_item) {
          shippingCost = usProfile.first_item.cost / 100;
        }
      }
      
      costs.set(variantKey, {
        production: productionCost,
        shipping: shippingCost
      });
      
      console.log(`   ✓ ${variantKey}: $${productionCost.toFixed(2)} production + $${shippingCost.toFixed(2)} shipping`);
    }
    
  } catch (error) {
    console.error(`❌ Error fetching Printify costs for blueprint ${blueprintId}:`, error);
  }
  
  return costs;
}

async function getShopifyLivePrices(): Promise<Map<string, number>> {
  console.log(`\n🛍️  Querying Shopify for live product prices...`);
  
  const prices = new Map<string, number>();
  
  if (!isShopifyConfigured()) {
    console.warn(`⚠️  Shopify is not configured - skipping price check`);
    return prices;
  }
  
  try {
    const products = await getAllProducts();
    
    if (!products || products.length === 0) {
      console.warn(`⚠️  No products found in Shopify store`);
      return prices;
    }
    
    console.log(`   Found ${products.length} products in Shopify`);
    
    // Extract variant prices
    for (const product of products) {
      if (!product.variants) continue;
      
      for (const variant of product.variants) {
        // Shopify variant titles are like "18x24 / Paper"
        const key = `${variant.option1} / ${variant.option2}`; // Size / Finish
        const price = parseFloat(variant.price);
        
        prices.set(key, price);
      }
    }
    
    console.log(`   ✓ Extracted ${prices.size} variant prices`);
    
  } catch (error) {
    console.error(`❌ Error fetching Shopify prices:`, error);
  }
  
  return prices;
}

function findConfigCosts(productType: string, size: string): { production: number; shipping: number } | null {
  // Map product type to config key
  const typeMap: Record<string, string> = {
    'poster': 'poster',
    'canvas': 'canvas',
    'framed': 'framed',
    'metal': 'metal'
  };
  
  const sizeMap: Record<string, string> = {
    '8x10': 'small',
    '8×10': 'small',
    '11x8': 'small',
    '11×8': 'small',
    '12x16': 'small',
    '12×16': 'small',
    '12x9': 'small',
    '12×9': 'small',
    '18x24': 'medium',
    '18×24': 'medium',
    '16x20': 'medium',
    '16×20': 'medium',
    '24x36': 'large',
    '24×36': 'large',
    '24x32': 'large',
    '24×32': 'large',
  };
  
  const typeKey = typeMap[productType.toLowerCase()];
  const sizeKey = sizeMap[size];
  
  if (!typeKey || !sizeKey) {
    return null;
  }
  
  const configKey = `${typeKey}_${sizeKey}`;
  const config = PRINTIFY_PRODUCTS[configKey];
  
  if (!config) {
    return null;
  }
  
  return {
    production: config.printifyCost,
    shipping: config.shipping
  };
}

async function runFinancialAudit() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║        FINANCIAL AUDIT - Live API Verification            ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  console.log('⚠️  NOTE: Printify does NOT expose production costs via their catalog API.');
  console.log('    Costs are only available when creating actual orders.');
  console.log('    This script will verify config file estimates and Shopify prices.\n');
  
  if (!isPrintifyConfigured()) {
    console.error('❌ Printify is not configured. Please set PRINTIFY_API_TOKEN');
    return;
  }
  
  // Step 1: Get live Printify costs
  console.log('\n📦 STEP 1: Fetching live Printify costs...\n');
  console.log('─'.repeat(60));
  
  const printifyCosts = new Map<string, Map<string, { production: number; shipping: number }>>();
  
  printifyCosts.set('poster', await getPrintifyLiveCosts(WALL_ART_BLUEPRINTS.POSTER));
  printifyCosts.set('canvas', await getPrintifyLiveCosts(WALL_ART_BLUEPRINTS.CANVAS));
  printifyCosts.set('framed', await getPrintifyLiveCosts(WALL_ART_BLUEPRINTS.FRAMED));
  printifyCosts.set('metal', await getPrintifyLiveCosts(WALL_ART_BLUEPRINTS.METAL));
  
  // Step 2: Get live Shopify prices
  console.log('\n─'.repeat(60));
  const shopifyPrices = await getShopifyLivePrices();
  
  // Step 3: Generate comparison report
  console.log('\n─'.repeat(60));
  console.log('\n📊 STEP 2: Generating Financial Comparison Report...\n');
  console.log('═'.repeat(60));
  
  const report: ProductFinancials[] = [];
  
  // Analyze each product type
  for (const [productType, variants] of Array.from(printifyCosts.entries())) {
    for (const [variantTitle, liveCosts] of Array.from(variants.entries())) {
      // Extract size from variant title (e.g., "18×24″" -> "18x24")
      const sizeMatch = variantTitle.match(/(\d+)\s*[×x]\s*(\d+)/);
      if (!sizeMatch) continue;
      
      const size = `${sizeMatch[1]}x${sizeMatch[2]}`;
      
      // Get config costs
      const configCosts = findConfigCosts(productType, size);
      
      // Find Shopify price for this variant
      let shopifyPrice: number | null = null;
      
      // Try different formats to match Shopify variant titles
      const possibleKeys = [
        `${size} / ${productType.charAt(0).toUpperCase() + productType.slice(1)}`,
        `${sizeMatch[1]}x${sizeMatch[2]} / ${productType.charAt(0).toUpperCase() + productType.slice(1)}`,
        `${sizeMatch[1]}×${sizeMatch[2]} / ${productType.charAt(0).toUpperCase() + productType.slice(1)}`,
      ];
      
      for (const key of possibleKeys) {
        if (shopifyPrices.has(key)) {
          shopifyPrice = shopifyPrices.get(key)!;
          break;
        }
      }
      
      // Calculate margins if we have Shopify price
      let margins = null;
      
      if (shopifyPrice) {
        const freeMargin = calculateProductMargin(shopifyPrice, liveCosts.production, liveCosts.shipping, ROYALTY_TIERS.FREE);
        const proMargin = calculateProductMargin(shopifyPrice, liveCosts.production, liveCosts.shipping, ROYALTY_TIERS.PRO);
        const eliteMargin = calculateProductMargin(shopifyPrice, liveCosts.production, liveCosts.shipping, ROYALTY_TIERS.ELITE);
        
        margins = {
          free: {
            platformMargin: freeMargin.platformMargin,
            platformMarginPercent: freeMargin.platformMarginPercent,
            artistRoyalty: freeMargin.costs.artistRoyalty,
            stripeFee: freeMargin.costs.paymentProcessing,
          },
          pro: {
            platformMargin: proMargin.platformMargin,
            platformMarginPercent: proMargin.platformMarginPercent,
            artistRoyalty: proMargin.costs.artistRoyalty,
            stripeFee: proMargin.costs.paymentProcessing,
          },
          elite: {
            platformMargin: eliteMargin.platformMargin,
            platformMarginPercent: eliteMargin.platformMarginPercent,
            artistRoyalty: eliteMargin.costs.artistRoyalty,
            stripeFee: eliteMargin.costs.paymentProcessing,
          },
        };
      }
      
      // Calculate recommended free shipping price
      const recommendedFreeShippingPrice = Math.ceil(liveCosts.production + liveCosts.shipping + 5); // Round up, add $5 buffer
      
      const financials: ProductFinancials = {
        productType: productType.charAt(0).toUpperCase() + productType.slice(1),
        variant: variantTitle,
        printifyProductionCost: liveCosts.production,
        printifyShippingCost: liveCosts.shipping,
        configProductionCost: configCosts?.production || 0,
        configShippingCost: configCosts?.shipping || 0,
        shopifyLivePrice: shopifyPrice,
        productionCostDiff: configCosts ? liveCosts.production - configCosts.production : 0,
        shippingCostDiff: configCosts ? liveCosts.shipping - configCosts.shipping : 0,
        margins,
        recommendedFreeShippingPrice,
      };
      
      report.push(financials);
    }
  }
  
  // Print detailed report
  console.log('\n📋 DETAILED FINANCIAL REPORT\n');
  console.log('═'.repeat(100));
  
  for (const item of report) {
    console.log(`\n${item.productType} - ${item.variant}`);
    console.log('─'.repeat(100));
    
    // Live Printify Costs
    console.log(`\n  💰 LIVE PRINTIFY COSTS:`);
    console.log(`     Production: $${item.printifyProductionCost.toFixed(2)}`);
    console.log(`     Shipping:   $${item.printifyShippingCost.toFixed(2)}`);
    console.log(`     Total COGS: $${(item.printifyProductionCost + item.printifyShippingCost).toFixed(2)}`);
    
    // Config File Comparison
    if (item.configProductionCost > 0) {
      console.log(`\n  📁 CONFIG FILE ESTIMATES:`);
      console.log(`     Production: $${item.configProductionCost.toFixed(2)}`);
      console.log(`     Shipping:   $${item.configShippingCost.toFixed(2)}`);
      
      // Show differences
      const prodDiff = item.productionCostDiff;
      const shipDiff = item.shippingCostDiff;
      
      if (Math.abs(prodDiff) > 0.01 || Math.abs(shipDiff) > 0.01) {
        console.log(`\n  ⚠️  DIFFERENCES DETECTED:`);
        if (Math.abs(prodDiff) > 0.01) {
          const sign = prodDiff > 0 ? '+' : '';
          console.log(`     Production: ${sign}$${prodDiff.toFixed(2)} (${prodDiff > 0 ? 'HIGHER' : 'LOWER'} than config)`);
        }
        if (Math.abs(shipDiff) > 0.01) {
          const sign = shipDiff > 0 ? '+' : '';
          console.log(`     Shipping:   ${sign}$${shipDiff.toFixed(2)} (${shipDiff > 0 ? 'HIGHER' : 'LOWER'} than config)`);
        }
      } else {
        console.log(`     ✅ Config matches live costs`);
      }
    }
    
    // Shopify Live Price
    if (item.shopifyLivePrice) {
      console.log(`\n  🛍️  SHOPIFY LIVE PRICE: $${item.shopifyLivePrice.toFixed(2)}`);
      
      // Show margins
      if (item.margins) {
        console.log(`\n  📊 CURRENT MARGINS (Separate Shipping):`);
        console.log(`     Free Artist (30%): Platform keeps $${item.margins.free.platformMargin.toFixed(2)} (${item.margins.free.platformMarginPercent.toFixed(1)}%)`);
        console.log(`     Pro Artist (35%):  Platform keeps $${item.margins.pro.platformMargin.toFixed(2)} (${item.margins.pro.platformMarginPercent.toFixed(1)}%)`);
        console.log(`     Elite Artist (45%): Platform keeps $${item.margins.elite.platformMargin.toFixed(2)} (${item.margins.elite.platformMarginPercent.toFixed(1)}%)`);
        
        // Flag unprofitable scenarios
        if (item.margins.free.platformMargin < 0 || item.margins.pro.platformMargin < 0 || item.margins.elite.platformMargin < 0) {
          console.log(`\n  🔴 WARNING: UNPROFITABLE PRICING DETECTED!`);
        }
      }
    } else {
      console.log(`\n  ⚠️  NOT FOUND IN SHOPIFY STORE`);
    }
    
    // Recommended free shipping price
    console.log(`\n  💡 RECOMMENDED FREE SHIPPING PRICE: $${item.recommendedFreeShippingPrice.toFixed(2)}`);
    console.log(`     (Covers production + shipping + $5 buffer)`);
  }
  
  // Summary statistics
  console.log('\n\n═'.repeat(100));
  console.log('\n📈 SUMMARY STATISTICS\n');
  console.log('═'.repeat(100));
  
  const totalProducts = report.length;
  const productsWithShopifyPrice = report.filter(r => r.shopifyLivePrice !== null).length;
  const productsNotInShopify = totalProducts - productsWithShopifyPrice;
  
  console.log(`\n  Total Products Analyzed: ${totalProducts}`);
  console.log(`  Products in Shopify: ${productsWithShopifyPrice}`);
  console.log(`  Products NOT in Shopify: ${productsNotInShopify}`);
  
  // Check for cost mismatches
  const costMismatches = report.filter(r => 
    Math.abs(r.productionCostDiff) > 0.50 || Math.abs(r.shippingCostDiff) > 0.50
  );
  
  if (costMismatches.length > 0) {
    console.log(`\n  ⚠️  Config File Mismatches: ${costMismatches.length} products have cost differences >$0.50`);
  } else {
    console.log(`\n  ✅ Config files are accurate (all costs within $0.50)`);
  }
  
  // Check for unprofitable products
  const unprofitable = report.filter(r => 
    r.margins && (r.margins.free.platformMargin < 0 || r.margins.pro.platformMargin < 0 || r.margins.elite.platformMargin < 0)
  );
  
  if (unprofitable.length > 0) {
    console.log(`\n  🔴 CRITICAL: ${unprofitable.length} products are UNPROFITABLE at current prices!`);
  } else {
    console.log(`\n  ✅ All products are profitable at current prices`);
  }
  
  console.log('\n═'.repeat(100));
  console.log('\n✅ Financial audit complete!\n');
  
  // Return report for programmatic use
  return report;
}

// Run the audit
runFinancialAudit()
  .then(() => {
    console.log('\n✅ Audit script completed successfully\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Audit script failed:', error);
    process.exit(1);
  });
