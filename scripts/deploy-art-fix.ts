import fs from 'fs';
import path from 'path';

const SHOPIFY_SHOP_URL = process.env.SHOPIFY_SHOP_URL || '';
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || '';
const LIVE_THEME_ID = process.env.SHOPIFY_THEME_ID || '179686146345';

// Ensure URL has protocol and normalize trailing slashes
const normalizeUrl = (url: string): string => {
  const withProtocol = url.startsWith('http') ? url : `https://${url}`;
  return withProtocol.replace(/\/+$/, ''); // Remove trailing slashes
};

const shopifyUrl = normalizeUrl(SHOPIFY_SHOP_URL);

interface DeploymentFile {
  key: string;
  attachment?: string;
  value?: string;
}

interface DeploymentResult {
  file: string;
  success: boolean;
  error?: string;
}

async function uploadAsset(themeId: string, assetKey: string, content: string | Buffer): Promise<boolean> {
  const url = `${shopifyUrl}/admin/api/2024-01/themes/${themeId}/assets.json`;
  
  const asset: DeploymentFile = { key: assetKey };
  
  if (Buffer.isBuffer(content)) {
    asset.attachment = content.toString('base64');
  } else {
    asset.value = content;
  }

  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ asset }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`❌ Failed to upload ${assetKey}:`, error);
      return false;
    }

    console.log(`✅ Uploaded: ${assetKey}`);
    return true;
  } catch (error) {
    console.error(`❌ Error uploading ${assetKey}:`, error);
    return false;
  }
}

async function deployArtFix(): Promise<void> {
  console.log('\n🚀 Starting Shopify Art Fix Deployment\n');
  console.log(`📍 Target: Live Theme #${LIVE_THEME_ID}`);
  console.log(`🏪 Store: ${shopifyUrl}\n`);

  if (!SHOPIFY_SHOP_URL || !SHOPIFY_ACCESS_TOKEN) {
    console.error('❌ Missing Shopify credentials!');
    console.error('Set SHOPIFY_SHOP_URL and SHOPIFY_ACCESS_TOKEN');
    process.exit(1);
  }

  const results: DeploymentResult[] = [];
  const themeDir = path.join(process.cwd(), 'attached_assets', 'theme');

  // Step 1: Upload product.art.json template as-is (no modifications)
  console.log('📝 Step 1: Uploading product template...\n');
  
  try {
    const templatePath = path.join(themeDir, 'templates', 'product.art.json');
    const templateContent = fs.readFileSync(templatePath, 'utf-8');
    
    const success = await uploadAsset(LIVE_THEME_ID, 'templates/product.art.json', templateContent);
    results.push({ file: 'templates/product.art.json', success });
    
    if (success) {
      console.log('✨ Product template deployed!\n');
    }
  } catch (error) {
    console.error('❌ Failed to upload template:', error);
    results.push({ file: 'templates/product.art.json', success: false, error: String(error) });
  }

  // Step 2: Upload section file
  console.log('📝 Step 2: Uploading product section...\n');
  
  try {
    const sectionPath = path.join(themeDir, 'sections', '247-art-product.liquid');
    const sectionContent = fs.readFileSync(sectionPath, 'utf-8');
    const success = await uploadAsset(LIVE_THEME_ID, 'sections/247-art-product.liquid', sectionContent);
    results.push({ file: 'sections/247-art-product.liquid', success });
  } catch (error) {
    console.error('❌ Failed to upload section:', error);
    results.push({ file: 'sections/247-art-product.liquid', success: false, error: String(error) });
  }

  // Step 3: Upload CSS
  console.log('\n📝 Step 3: Uploading CSS...\n');
  
  try {
    const cssPath = path.join(themeDir, 'assets', '247-art.css');
    const cssContent = fs.readFileSync(cssPath, 'utf-8');
    const success = await uploadAsset(LIVE_THEME_ID, 'assets/247-art.css', cssContent);
    results.push({ file: 'assets/247-art.css', success });
  } catch (error) {
    console.error('❌ Failed to upload CSS:', error);
    results.push({ file: 'assets/247-art.css', success: false, error: String(error) });
  }

  // Step 4: Upload JavaScript
  console.log('\n📝 Step 4: Uploading JavaScript...\n');
  
  try {
    const jsPath = path.join(themeDir, 'assets', '247-art.js');
    const jsContent = fs.readFileSync(jsPath, 'utf-8');
    const success = await uploadAsset(LIVE_THEME_ID, 'assets/247-art.js', jsContent);
    results.push({ file: 'assets/247-art.js', success });
  } catch (error) {
    console.error('❌ Failed to upload JS:', error);
    results.push({ file: 'assets/247-art.js', success: false, error: String(error) });
  }

  // Step 5: Upload mockup images
  console.log('\n📝 Step 5: Uploading mockup images...\n');
  
  const mockupImages = [
    'mockup-living.png',
    'mockup-bedroom.png',
    'mockup-office.png',
    'mockup-gallery.png',
    'mockup-living-thumb.png',
    'mockup-bedroom-thumb.png',
    'mockup-office-thumb.png',
    'mockup-gallery-thumb.png',
  ];

  for (const imageName of mockupImages) {
    try {
      const imagePath = path.join(themeDir, 'assets', imageName);
      
      if (!fs.existsSync(imagePath)) {
        console.log(`⚠️  Skipping ${imageName} (file not found)`);
        results.push({ file: `assets/${imageName}`, success: false, error: 'File not found' });
        continue;
      }
      
      const imageBuffer = fs.readFileSync(imagePath);
      const success = await uploadAsset(LIVE_THEME_ID, `assets/${imageName}`, imageBuffer);
      results.push({ file: `assets/${imageName}`, success });
    } catch (error) {
      console.error(`❌ Failed to upload ${imageName}:`, error);
      results.push({ file: `assets/${imageName}`, success: false, error: String(error) });
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 DEPLOYMENT SUMMARY');
  console.log('='.repeat(60) + '\n');
  
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`✅ Successful: ${successful}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📦 Total: ${results.length}\n`);
  
  if (failed > 0) {
    console.log('Failed files:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`  - ${r.file}${r.error ? `: ${r.error}` : ''}`);
    });
    console.log('');
  }
  
  if (successful > 0) {
    console.log('✨ Deployment completed!\n');
    console.log('🌐 Test your product page:');
    console.log('   https://369artcollective.com/products/abandoned-factory-1\n');
    console.log('💡 Hard refresh (Ctrl+Shift+R) to see changes\n');
  }
  
  if (failed > 0) {
    process.exit(1);
  }
}

// Run deployment
deployArtFix().catch(error => {
  console.error('\n💥 Deployment failed:', error);
  process.exit(1);
});
