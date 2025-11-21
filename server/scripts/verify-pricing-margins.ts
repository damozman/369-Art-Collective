/**
 * Pricing & Margin Verification Script
 * 
 * Since Printify doesn't expose production costs via catalog API,
 * this script uses config file estimates + LIVE Shopify prices to:
 * 
 * 1. Verify current margins for all products at all artist tiers
 * 2. Identify unprofitable scenarios
 * 3. Recommend FREE SHIPPING prices
 * 4. Show exact platform profit breakdown
 */

import { PRINTIFY_PRODUCTS, calculateProductMargin, ROYALTY_TIERS } from '../../shared/financial-utils';
import { getAllProducts, isShopifyConfigured } from '../lib/shopify';
import fs from 'fs/promises';

interface ProductAnalysis {
  product: string;
  size: string;
  finish: string;
  
  // Config File Costs (Printify estimates)
  printifyCost: number;
  shippingCost: number;
  totalCOGS: number;
  
  // Shopify Live Price
  shopifyPrice: number | null;
  priceStatus: 'found' | 'not_in_shopify' | 'price_mismatch';
  
  // Current Margins (with separate shipping)
  currentMargins: {
    free: { platform: number; platformPercent: number; artist: number; stripeFee: number };
    pro: { platform: number; platformPercent: number; artist: number; stripeFee: number };
    elite: { platform: number; platformPercent: number; artist: number; stripeFee: number };
  } | null;
  
  // Free Shipping Recommendations
  recommendedFreeShipPrice: number;
  freeShipMargins: {
    free: { platform: number; platformPercent: number; artist: number; stripeFee: number };
    pro: { platform: number; platformPercent: number; artist: number; stripeFee: number };
    elite: { platform: number; platformPercent: number; artist: number; stripeFee: number };
  };
  
  // Flags
  isUnprofitable: boolean;
  profitWarnings: string[];
}

async function analyzeAllProducts(): Promise<ProductAnalysis[]> {
  const analysis: ProductAnalysis[] = [];
  
  // Get live Shopify prices
  console.log('\n🛍️  Fetching live Shopify prices...');
  const shopifyPrices = new Map<string, number>();
  
  if (isShopifyConfigured()) {
    try {
      const products = await getAllProducts();
      console.log(`   ✓ Found ${products.length} products in Shopify\n`);
      
      for (const product of products) {
        if (!product.variants) continue;
        
        for (const variant of product.variants) {
          const size = variant.option1; // e.g., "18x24"
          const finish = variant.option2; // e.g., "Paper"
          const key = `${size}/${finish}`;
          const price = parseFloat(variant.price);
          
          shopifyPrices.set(key, price);
        }
      }
      
      console.log(`   ✓ Extracted ${shopifyPrices.size} variant prices\n`);
    } catch (error) {
      console.warn(`   ⚠️  Error fetching Shopify prices:`, error);
    }
  } else {
    console.warn(`   ⚠️  Shopify not configured - will show config-only analysis\n`);
  }
  
  // Analyze each product in config
  console.log('📊 Analyzing products...\n');
  console.log('─'.repeat(100));
  
  for (const [configKey, config] of Object.entries(PRINTIFY_PRODUCTS)) {
    // Parse config key: "poster_medium" -> { type: "poster", size: "medium" }
    const [type, sizeKey] = configKey.split('_');
    
    // Map size keys to actual dimensions
    const sizeMap: Record<string, string> = {
      'small': type === 'poster' ? '8x10' : '12x16',
      'medium': type === 'poster' ? '18x24' : type === 'canvas' ? '16x20' : '18x24',
      'large': type === 'poster' ? '24x36' : type === 'canvas' ? '24x32' : '24x36',
    };
    
    const actualSize = sizeMap[sizeKey] || sizeKey;
    const finish = type.charAt(0).toUpperCase() + type.slice(1); // "poster" -> "Poster"
    
    // Find Shopify price
    const shopifyKey = `${actualSize}/${finish === 'Poster' ? 'Paper' : finish}`;
    const shopifyPrice = shopifyPrices.get(shopifyKey) || null;
    
    const totalCOGS = config.printifyCost + config.shipping;
    
    // Calculate current margins (if we have Shopify price)
    let currentMargins = null;
    if (shopifyPrice) {
      const freeCalc = calculateProductMargin(shopifyPrice, config.printifyCost, config.shipping, ROYALTY_TIERS.FREE);
      const proCalc = calculateProductMargin(shopifyPrice, config.printifyCost, config.shipping, ROYALTY_TIERS.PRO);
      const eliteCalc = calculateProductMargin(shopifyPrice, config.printifyCost, config.shipping, ROYALTY_TIERS.ELITE);
      
      currentMargins = {
        free: {
          platform: freeCalc.platformMargin,
          platformPercent: freeCalc.platformMarginPercent,
          artist: freeCalc.costs.artistRoyalty,
          stripeFee: freeCalc.costs.paymentProcessing,
        },
        pro: {
          platform: proCalc.platformMargin,
          platformPercent: proCalc.platformMarginPercent,
          artist: proCalc.costs.artistRoyalty,
          stripeFee: proCalc.costs.paymentProcessing,
        },
        elite: {
          platform: eliteCalc.platformMargin,
          platformPercent: eliteCalc.platformMarginPercent,
          artist: eliteCalc.costs.artistRoyalty,
          stripeFee: eliteCalc.costs.paymentProcessing,
        },
      };
    }
    
    // Recommended free shipping price (covers COGS + Stripe + minimum platform margin)
    const recommendedFreeShipPrice = Math.ceil(totalCOGS + 10); // Round up, add $10 buffer for margins
    
    // Calculate free shipping margins
    const freeShipFreeCalc = calculateProductMargin(recommendedFreeShipPrice, config.printifyCost, config.shipping, ROYALTY_TIERS.FREE);
    const freeShipProCalc = calculateProductMargin(recommendedFreeShipPrice, config.printifyCost, config.shipping, ROYALTY_TIERS.PRO);
    const freeShipEliteCalc = calculateProductMargin(recommendedFreeShipPrice, config.printifyCost, config.shipping, ROYALTY_TIERS.ELITE);
    
    const freeShipMargins = {
      free: {
        platform: freeShipFreeCalc.platformMargin,
        platformPercent: freeShipFreeCalc.platformMarginPercent,
        artist: freeShipFreeCalc.costs.artistRoyalty,
        stripeFee: freeShipFreeCalc.costs.paymentProcessing,
      },
      pro: {
        platform: freeShipProCalc.platformMargin,
        platformPercent: freeShipProCalc.platformMarginPercent,
        artist: freeShipProCalc.costs.artistRoyalty,
        stripeFee: freeShipProCalc.costs.paymentProcessing,
      },
      elite: {
        platform: freeShipEliteCalc.platformMargin,
        platformPercent: freeShipEliteCalc.platformMarginPercent,
        artist: freeShipEliteCalc.costs.artistRoyalty,
        stripeFee: freeShipEliteCalc.costs.paymentProcessing,
      },
    };
    
    // Check for unprofitable scenarios
    const profitWarnings: string[] = [];
    let isUnprofitable = false;
    
    if (currentMargins) {
      if (currentMargins.free.platform < 0) {
        profitWarnings.push('UNPROFITABLE for Free artists');
        isUnprofitable = true;
      }
      if (currentMargins.pro.platform < 0) {
        profitWarnings.push('UNPROFITABLE for Pro artists');
        isUnprofitable = true;
      }
      if (currentMargins.elite.platform < 0) {
        profitWarnings.push('UNPROFITABLE for Elite artists');
        isUnprofitable = true;
      }
      if (currentMargins.free.platform < 5 && currentMargins.free.platform >= 0) {
        profitWarnings.push('LOW MARGIN (<$5) for Free artists');
      }
    }
    
    analysis.push({
      product: finish,
      size: actualSize,
      finish: finish === 'Poster' ? 'Paper' : finish,
      printifyCost: config.printifyCost,
      shippingCost: config.shipping,
      totalCOGS,
      shopifyPrice,
      priceStatus: shopifyPrice ? 'found' : 'not_in_shopify',
      currentMargins,
      recommendedFreeShipPrice,
      freeShipMargins,
      isUnprofitable,
      profitWarnings,
    });
  }
  
  return analysis;
}

async function generateReport() {
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║     PRICING & MARGIN VERIFICATION - Real Shopify Data          ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');
  
  const analysis = await analyzeAllProducts();
  
  // Separate by product type
  const byProduct = analysis.reduce((acc, item) => {
    if (!acc[item.product]) acc[item.product] = [];
    acc[item.product].push(item);
    return acc;
  }, {} as Record<string, ProductAnalysis[]>);
  
  // Print detailed report
  console.log('\n═'.repeat(100));
  console.log('CURRENT PRICING ANALYSIS (Separate Shipping)\n');
  console.log('═'.repeat(100));
  
  for (const [productType, items] of Object.entries(byProduct)) {
    console.log(`\n\n📦 ${productType.toUpperCase()}\n`);
    console.log('─'.repeat(100));
    
    for (const item of items) {
      console.log(`\n  ${item.size}"`);
      console.log(`  ` + '─'.repeat(95));
      
      console.log(`\n  💰 COSTS (Config Estimates):`);
      console.log(`     Printify Production: $${item.printifyCost.toFixed(2)}`);
      console.log(`     Shipping (avg US):   $${item.shippingCost.toFixed(2)}`);
      console.log(`     Total COGS:          $${item.totalCOGS.toFixed(2)}`);
      
      if (item.shopifyPrice) {
        console.log(`\n  🛍️  SHOPIFY LIVE PRICE: $${item.shopifyPrice.toFixed(2)} (customer pays shipping separately)`);
        
        if (item.currentMargins) {
          console.log(`\n  📊 YOUR CURRENT MARGINS:`);
          console.log(`     Free Tier (30%):  You keep $${item.currentMargins.free.platform.toFixed(2)} (${item.currentMargins.free.platformPercent.toFixed(1)}%) | Artist gets $${item.currentMargins.free.artist.toFixed(2)}`);
          console.log(`     Pro Tier (35%):   You keep $${item.currentMargins.pro.platform.toFixed(2)} (${item.currentMargins.pro.platformPercent.toFixed(1)}%) | Artist gets $${item.currentMargins.pro.artist.toFixed(2)}`);
          console.log(`     Elite Tier (45%): You keep $${item.currentMargins.elite.platform.toFixed(2)} (${item.currentMargins.elite.platformPercent.toFixed(1)}%) | Artist gets $${item.currentMargins.elite.artist.toFixed(2)}`);
          
          if (item.profitWarnings.length > 0) {
            console.log(`\n  ⚠️  WARNINGS:`);
            item.profitWarnings.forEach(warning => {
              console.log(`     ${warning}`);
            });
          }
        }
      } else {
        console.log(`\n  ⚠️  NOT FOUND IN SHOPIFY STORE`);
      }
      
      console.log(`\n  💡 RECOMMENDED FREE SHIPPING PRICE: $${item.recommendedFreeShipPrice.toFixed(2)}`);
      console.log(`\n  📊 FREE SHIPPING MARGINS (baked into price):`);
      console.log(`     Free Tier (30%):  You keep $${item.freeShipMargins.free.platform.toFixed(2)} (${item.freeShipMargins.free.platformPercent.toFixed(1)}%) | Artist gets $${item.freeShipMargins.free.artist.toFixed(2)}`);
      console.log(`     Pro Tier (35%):   You keep $${item.freeShipMargins.pro.platform.toFixed(2)} (${item.freeShipMargins.pro.platformPercent.toFixed(1)}%) | Artist gets $${item.freeShipMargins.pro.artist.toFixed(2)}`);
      console.log(`     Elite Tier (45%): You keep $${item.freeShipMargins.elite.platform.toFixed(2)} (${item.freeShipMargins.elite.platformPercent.toFixed(1)}%) | Artist gets $${item.freeShipMargins.elite.artist.toFixed(2)}`);
    }
  }
  
  // Summary statistics
  console.log('\n\n═'.repeat(100));
  console.log('\n📈 SUMMARY STATISTICS\n');
  console.log('═'.repeat(100));
  
  const totalProducts = analysis.length;
  const inShopify = analysis.filter(a => a.shopifyPrice !== null).length;
  const notInShopify = totalProducts - inShopify;
  const unprofitable = analysis.filter(a => a.isUnprofitable).length;
  const warnings = analysis.filter(a => a.profitWarnings.length > 0).length;
  
  console.log(`\n  Total Products Analyzed:     ${totalProducts}`);
  console.log(`  Products in Shopify:         ${inShopify}`);
  console.log(`  Products NOT in Shopify:     ${notInShopify}`);
  console.log(`  Unprofitable Products:       ${unprofitable} ${unprofitable > 0 ? '🔴 CRITICAL' : '✅'}`);
  console.log(`  Products with Warnings:      ${warnings} ${warnings > 0 ? '⚠️' : '✅'}`);
  
  // Calculate average margins
  const withPrices = analysis.filter(a => a.currentMargins);
  if (withPrices.length > 0) {
    const avgFreeMargin = withPrices.reduce((sum, a) => sum + a.currentMargins!.free.platformPercent, 0) / withPrices.length;
    const avgProMargin = withPrices.reduce((sum, a) => sum + a.currentMargins!.pro.platformPercent, 0) / withPrices.length;
    const avgEliteMargin = withPrices.reduce((sum, a) => sum + a.currentMargins!.elite.platformPercent, 0) / withPrices.length;
    
    console.log(`\n  Average Platform Margins:`);
    console.log(`     Free Tier (30%):  ${avgFreeMargin.toFixed(1)}%`);
    console.log(`     Pro Tier (35%):   ${avgProMargin.toFixed(1)}%`);
    console.log(`     Elite Tier (45%): ${avgEliteMargin.toFixed(1)}%`);
  }
  
  console.log('\n═'.repeat(100));
  
  // Save to JSON file for programmatic use
  await fs.writeFile(
    'pricing-analysis-report.json',
    JSON.stringify(analysis, null, 2)
  );
  
  console.log('\n✅ Report saved to: pricing-analysis-report.json\n');
  
  return analysis;
}

// Run the report
generateReport()
  .then(() => {
    console.log('✅ Analysis complete!\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Analysis failed:', error);
    process.exit(1);
  });
