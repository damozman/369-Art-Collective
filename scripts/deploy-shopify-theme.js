#!/usr/bin/env node

/**
 * 247 Print Network - Shopify Theme Deployment Script
 * 
 * This script automates the deployment of custom theme files to your Shopify store.
 * It uploads all art product customization files using the Shopify CLI.
 * 
 * Usage:
 *   node scripts/deploy-shopify-theme.js
 *   
 * Or via npm:
 *   npm run shopify:deploy
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ANSI colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('');
  log(`${'='.repeat(60)}`, colors.blue);
  log(`  ${title}`, colors.bright);
  log(`${'='.repeat(60)}`, colors.blue);
  console.log('');
}

function checkFileExists(filePath) {
  if (!fs.existsSync(filePath)) {
    log(`❌ ERROR: File not found: ${filePath}`, colors.red);
    process.exit(1);
  }
  log(`✓ Found: ${filePath}`, colors.green);
}

function runCommand(command, description) {
  log(`\n🔧 ${description}...`, colors.blue);
  try {
    execSync(command, { stdio: 'inherit' });
    log(`✓ ${description} completed`, colors.green);
    return true;
  } catch (error) {
    log(`❌ ${description} failed`, colors.red);
    return false;
  }
}

// Main deployment process
async function deploy() {
  logSection('247 Print Network - Shopify Theme Deployment');

  // Step 1: Verify all theme files exist
  log('Step 1: Verifying theme files...', colors.bright);
  const themeFiles = [
    // Layout (1 file)
    'attached_assets/theme/layout/theme.liquid',
    // Config (1 file)
    'attached_assets/theme/config/settings_schema.json',
    // Sections (20 files)
    'attached_assets/theme/sections/header.liquid',
    'attached_assets/theme/sections/footer.liquid',
    'attached_assets/theme/sections/247-about-content.liquid',
    'attached_assets/theme/sections/247-all-collections.liquid',
    'attached_assets/theme/sections/247-art-product.liquid',
    'attached_assets/theme/sections/247-artist-cta-banner.liquid',
    'attached_assets/theme/sections/247-collection-grid.liquid',
    'attached_assets/theme/sections/247-collection-header.liquid',
    'attached_assets/theme/sections/247-contact-form.liquid',
    'attached_assets/theme/sections/247-creators-grid.liquid',
    'attached_assets/theme/sections/247-faq-accordion.liquid',
    'attached_assets/theme/sections/247-featured-artists.liquid',
    'attached_assets/theme/sections/247-featured-artworks.liquid',
    'attached_assets/theme/sections/247-featured-collections.liquid',
    'attached_assets/theme/sections/247-homepage-hero.liquid',
    'attached_assets/theme/sections/247-join-benefits.liquid',
    'attached_assets/theme/sections/247-join-cta.liquid',
    'attached_assets/theme/sections/247-merch-preview.liquid',
    'attached_assets/theme/sections/247-page-hero.liquid',
    'attached_assets/theme/sections/247-trust-badges.liquid',
    // Snippets (3 files)
    'attached_assets/theme/snippets/247-art-options.liquid',
    'attached_assets/theme/snippets/247-art-lineitem-properties.liquid',
    'attached_assets/theme/snippets/247-merch-upsell.liquid',
    // Assets (2 files)
    'attached_assets/theme/assets/247-art.js',
    'attached_assets/theme/assets/247-art.css',
    // Templates (9 files)
    'attached_assets/theme/templates/index.json',
    'attached_assets/theme/templates/collection.json',
    'attached_assets/theme/templates/list-collections.json',
    'attached_assets/theme/templates/page.about.json',
    'attached_assets/theme/templates/page.contact.json',
    'attached_assets/theme/templates/page.creators.json',
    'attached_assets/theme/templates/page.faq.json',
    'attached_assets/theme/templates/page.join.json',
    'attached_assets/theme/templates/product.art.json',
  ];

  themeFiles.forEach(checkFileExists);
  log(`\n✓ All ${themeFiles.length} theme files verified!`, colors.green);

  // Step 2: Check Shopify CLI authentication
  logSection('Step 2: Checking Shopify Authentication');
  log('Verifying you are logged in to Shopify...', colors.blue);
  
  try {
    execSync('shopify whoami', { stdio: 'pipe' });
    log('✓ Shopify authentication verified', colors.green);
  } catch (error) {
    log('⚠ Could not verify authentication, but will attempt deployment anyway...', colors.yellow);
    log('(If deployment fails, run: npm run shopify:auth)', colors.reset);
  }

  // Step 3: Deploy theme files
  logSection('Step 3: Deploying Theme Files');
  
  log('This will push the following files to your Shopify theme:', colors.blue);
  themeFiles.forEach(file => {
    const fileName = path.basename(file);
    const fileType = path.dirname(file).split('/').pop();
    log(`  • ${fileType}/${fileName}`, colors.reset);
  });

  log('\nPushing files to Shopify...', colors.bright);
  log('(This may take 30-60 seconds)', colors.yellow);

  // Get store URL from environment variable
  const storeUrl = process.env.SHOPIFY_STORE_URL || process.env.SHOPIFY_FLAG_STORE;
  
  if (!storeUrl) {
    log('\n❌ Store URL not configured', colors.red);
    log('\nPlease set your Shopify store URL:', colors.bright);
    log('Option 1: Add to .env file:', colors.reset);
    log('  SHOPIFY_STORE_URL=bvhpq0-hy.myshopify.com', colors.yellow);
    log('\nOption 2: Set as environment variable:', colors.reset);
    log('  export SHOPIFY_STORE_URL=bvhpq0-hy.myshopify.com', colors.yellow);
    log('\nThen run the deployment again.', colors.reset);
    process.exit(1);
  }

  log(`Deploying to store: ${storeUrl}`, colors.blue);
  
  // Build --only parameter with all files
  const onlyFiles = [
    // Layout
    'layout/theme.liquid',
    // Config
    'config/settings_schema.json',
    // All sections
    'sections/header.liquid',
    'sections/footer.liquid',
    'sections/247-about-content.liquid',
    'sections/247-all-collections.liquid',
    'sections/247-art-product.liquid',
    'sections/247-artist-cta-banner.liquid',
    'sections/247-collection-grid.liquid',
    'sections/247-collection-header.liquid',
    'sections/247-contact-form.liquid',
    'sections/247-creators-grid.liquid',
    'sections/247-faq-accordion.liquid',
    'sections/247-featured-artists.liquid',
    'sections/247-featured-artworks.liquid',
    'sections/247-featured-collections.liquid',
    'sections/247-homepage-hero.liquid',
    'sections/247-join-benefits.liquid',
    'sections/247-join-cta.liquid',
    'sections/247-merch-preview.liquid',
    'sections/247-page-hero.liquid',
    'sections/247-trust-badges.liquid',
    // All snippets
    'snippets/247-art-options.liquid',
    'snippets/247-art-lineitem-properties.liquid',
    'snippets/247-merch-upsell.liquid',
    // All assets
    'assets/247-art.js',
    'assets/247-art.css',
    // All templates
    'templates/index.json',
    'templates/collection.json',
    'templates/list-collections.json',
    'templates/page.about.json',
    'templates/page.contact.json',
    'templates/page.creators.json',
    'templates/page.faq.json',
    'templates/page.join.json',
    'templates/product.art.json',
  ].join(' ');
  
  // Use --development flag to push to development theme (auto-creates if needed)
  // Use --force to skip confirmation prompts in non-interactive mode
  const deployCommand = `shopify theme push --store=${storeUrl} --path attached_assets/theme --development --force --only ${onlyFiles}`;
  
  log('Note: Deploying to development theme. Use --live flag for production.', colors.yellow);
  const success = runCommand(deployCommand, 'Uploading all 36 theme files (including header & footer)');

  if (success) {
    logSection('✅ Deployment Successful!');
    log('Your custom art product files are now live on Shopify.', colors.green);
    log('\nNext steps:', colors.bright);
    log('1. Create a custom product template called "art" in your theme', colors.reset);
    log('2. Assign the "art" template to your art products', colors.reset);
    log('\nFor detailed instructions, see: SHOPIFY_DEPLOYMENT_GUIDE.md', colors.blue);
  } else {
    logSection('❌ Deployment Failed');
    log('Please check the error messages above.', colors.red);
    log('\nCommon issues:', colors.bright);
    log('• Not authenticated: Run npm run shopify:auth', colors.reset);
    log('• Wrong store: Make sure you are connected to the correct Shopify store', colors.reset);
    log('• Network issues: Check your internet connection', colors.reset);
    process.exit(1);
  }
}

// Run deployment
deploy().catch(error => {
  log(`\n❌ Unexpected error: ${error.message}`, colors.red);
  process.exit(1);
});
