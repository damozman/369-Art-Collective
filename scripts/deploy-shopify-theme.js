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
    'attached_assets/theme/sections/247-art-product.liquid',
    'attached_assets/theme/snippets/247-art-options.liquid',
    'attached_assets/theme/snippets/247-art-lineitem-properties.liquid',
    'attached_assets/theme/snippets/247-merch-upsell.liquid',
    'attached_assets/theme/assets/247-art.js',
  ];

  themeFiles.forEach(checkFileExists);
  log('\n✓ All theme files verified!', colors.green);

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

  const deployCommand = `shopify theme push --path attached_assets/theme --only sections/247-art-product.liquid snippets/247-art-options.liquid snippets/247-art-lineitem-properties.liquid snippets/247-merch-upsell.liquid assets/247-art.js`;
  
  const success = runCommand(deployCommand, 'Uploading theme files');

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
