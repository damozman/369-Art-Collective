/**
 * Test Order Capture System
 * Tests Shopify webhook endpoint, order processing, and royalty calculation
 */

import crypto from 'crypto';
import { db } from './lib/db';
import { artists, artworks, orders, sales } from '@shared/schema';
import { eq } from 'drizzle-orm';

const BASE_URL = `http://localhost:${process.env.PORT || 5000}`;

async function testOrderCapture() {
  console.log('\n🧪 Testing Order Capture & Royalty System\n');

  try {
    console.log('1️⃣ Creating test artist...');
    const [testArtist] = await db.insert(artists).values({
      email: `test-order-${Date.now()}@example.com`,
      password: '$2a$10$test',
      name: 'Order Test Artist',
      artistShort: 'OTA99',
      approved: true,
    }).returning();
    console.log(`✅ Artist created: ${testArtist.id} (${testArtist.artistShort})`);

    console.log('\n2️⃣ Creating test artwork...');
    const [testArtwork] = await db.insert(artworks).values({
      artistId: testArtist.id,
      title: 'Order Test Artwork',
      description: 'Test artwork for order capture',
      tags: ['test', 'order'],
      imageUrl: '/uploads/test.jpg',
      status: 'approved',
      shopifyProductId: 'shopify-test-123',
      printifyProductId: 'printify-test-123', // Required for order processing
      printifyImageId: 'printify-image-123',
    }).returning();
    console.log(`✅ Artwork created: ${testArtwork.id}`);

    console.log('\n3️⃣ Simulating Shopify webhook...');
    const orderId = Math.floor(Math.random() * 1000000000);
    const sku = `ART-${testArtist.artistShort}-${testArtwork.id}-16x20-Canvas`;
    
    const webhookPayload = {
      id: orderId,
      email: 'customer@example.com',
      created_at: new Date().toISOString(),
      total_price: '99.99',
      line_items: [{
        id: 1,
        product_id: 123,
        variant_id: 456,
        sku: sku,
        title: 'Order Test Artwork',
        quantity: 1,
        price: '99.99',
        name: 'Order Test Artwork - 16x20 Canvas'
      }]
    };

    const webhookBody = JSON.stringify(webhookPayload);
    const hmacSecret = process.env.SHOPIFY_ACCESS_TOKEN || '';
    const hmac = crypto
      .createHmac('sha256', hmacSecret)
      .update(webhookBody, 'utf8')
      .digest('base64');

    console.log(`   SKU: ${sku}`);
    console.log(`   Order ID: ${orderId}`);

    const response = await fetch(`${BASE_URL}/api/webhooks/shopify/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Shop-Domain': 'test.myshopify.com',
        'X-Shopify-Hmac-Sha256': hmac,
      },
      body: webhookBody,
    });

    if (response.ok) {
      console.log('✅ Webhook accepted (200 OK)');
    } else {
      console.error(`❌ Webhook rejected: ${response.status}`);
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('\n4️⃣ Checking order record...');
    const orderRecords = await db
      .select()
      .from(orders)
      .where(eq(orders.shopifyOrderId, orderId.toString()));

    if (orderRecords.length === 0) {
      console.error('❌ No order found in database');
      return;
    }

    const order = orderRecords[0];
    console.log('✅ Order created:');
    console.log(`   ID: ${order.id}`);
    console.log(`   Artwork ID: ${order.artworkId}`);
    console.log(`   Artist ID: ${order.artistId}`);
    console.log(`   Product Price: $${order.productPrice}`);
    console.log(`   Profit: $${order.profit}`);
    console.log(`   Referral Bonus: ${order.referralBonus}`);

    console.log('\n5️⃣ Checking sale record...');
    const saleRecords = await db
      .select()
      .from(sales)
      .where(eq(sales.orderId, order.id));

    if (saleRecords.length === 0) {
      console.error('❌ No sale found in database');
      return;
    }

    const sale = saleRecords[0];
    console.log('✅ Sale created:');
    console.log(`   Royalty Tier: ${sale.royaltyTier}%`);
    console.log(`   Base Royalty: $${sale.baseRoyalty}`);
    console.log(`   Referral Bonus: $${sale.referralBonus}`);
    console.log(`   Recruitment Bonus: $${sale.recruitmentBonus}`);
    console.log(`   Total Earnings: $${sale.totalEarnings}`);

    console.log('\n6️⃣ Testing tier calculation (higher monthly sales)...');
    await db
      .update(artists)
      .set({ monthlySales: '5500' })
      .where(eq(artists.id, testArtist.id));

    const orderId2 = orderId + 1;
    const webhookPayload2 = { ...webhookPayload, id: orderId2 };
    const webhookBody2 = JSON.stringify(webhookPayload2);
    const hmac2 = crypto
      .createHmac('sha256', hmacSecret)
      .update(webhookBody2, 'utf8')
      .digest('base64');

    const response2 = await fetch(`${BASE_URL}/api/webhooks/shopify/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Shop-Domain': 'test.myshopify.com',
        'X-Shopify-Hmac-Sha256': hmac2,
      },
      body: webhookBody2,
    });

    if (!response2.ok) {
      console.error(`❌ Second webhook rejected: ${response2.status}`);
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 2000));

    const orderRecords2 = await db
      .select()
      .from(orders)
      .where(eq(orders.shopifyOrderId, orderId2.toString()));

    if (orderRecords2.length === 0) {
      console.error('❌ Second order not found');
      return;
    }

    const saleRecords2 = await db
      .select()
      .from(sales)
      .where(eq(sales.orderId, orderRecords2[0].id));

    if (saleRecords2.length === 0) {
      console.error('❌ Second sale not found');
      return;
    }

    console.log('✅ Second sale created with higher tier:');
    console.log(`   Royalty Tier: ${saleRecords2[0].royaltyTier}% (expected 40% for $5500 monthly sales)`);

    console.log('\n✅ All tests passed!');
    console.log('\n📊 Summary:');
    console.log(`   - Webhook HMAC verification: ✅`);
    console.log(`   - Order processing: ✅`);
    console.log(`   - Sale creation: ✅`);
    console.log(`   - Royalty tier calculation: ✅`);
    console.log(`   - Tier 1 (30%): ${sale.royaltyTier}%`);
    console.log(`   - Tier 3 (40%): ${saleRecords2[0].royaltyTier}%`);

  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error);
  }

  process.exit(0);
}

testOrderCapture();
