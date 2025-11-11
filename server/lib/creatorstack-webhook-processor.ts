/**
 * CreatorStack Shopify Webhook Processor
 * Handles kit purchase webhooks from Shopify
 */

import { storage } from "../storage";
import { nanoid } from "nanoid";

interface ShopifyLineItem {
  id: number;
  product_id: number;
  variant_id: number;
  sku: string;
  title: string;
  quantity: number;
  price: string;
}

interface ShopifyWebhookOrder {
  id: number;
  email: string;
  created_at: string;
  total_price: string;
  line_items: ShopifyLineItem[];
}

/**
 * Parse SKU to extract kit ID
 * SKU format: KIT-{kitId}
 * Example: KIT-abc123-def456-ghij789
 */
function parseKitSKU(sku: string): string | null {
  const match = sku.match(/^KIT-([a-f0-9-]+)$/);
  if (!match) return null;
  return match[1];
}

/**
 * Process CreatorStack kit purchase from Shopify webhook
 * 1. Extract buyer email and kit SKUs from line items
 * 2. Auto-create buyer account if doesn't exist (passwordless)
 * 3. Create purchase records (idempotent using shopifyOrderId + lineItemId)
 * 4. Return processing summary
 */
export async function processCreatorStackPurchase(shopifyOrder: ShopifyWebhookOrder) {
  console.log(`[CreatorStack] Processing Shopify order: ${shopifyOrder.id}`);
  
  const { email, id: shopifyOrderId, line_items } = shopifyOrder;
  
  // Validate email
  if (!email || !email.includes('@')) {
    console.error(`[CreatorStack] Invalid email in order ${shopifyOrderId}: ${email}`);
    return { success: false, error: 'invalid_email' };
  }

  // Find or create buyer
  let buyer = await storage.getCreatorstackBuyerByEmail(email);
  
  if (!buyer) {
    // Auto-provision buyer account (passwordless - will trigger email-based password setup)
    const tempPassword = nanoid(32); // Temporary secure password
    buyer = await storage.createCreatorstackBuyer({
      email,
      password: tempPassword, // Will be hashed by storage layer
      name: email.split('@')[0], // Use email prefix as initial name
      isPro: false,
    });
    
    console.log(`[CreatorStack] Auto-created buyer account: ${email} (ID: ${buyer.id})`);
    // TODO: Trigger email-based password setup flow
  }

  // Process each line item
  const processed: Array<{ kitId: string; success: boolean; error?: string }> = [];
  
  for (const item of line_items) {
    const kitId = parseKitSKU(item.sku);
    
    if (!kitId) {
      console.warn(`[CreatorStack] Invalid SKU format: ${item.sku} in order ${shopifyOrderId}`);
      processed.push({ kitId: item.sku, success: false, error: 'invalid_sku' });
      continue;
    }

    // Verify kit exists
    const kit = await storage.getCreatorstackKitById(kitId);
    if (!kit) {
      console.error(`[CreatorStack] Kit not found: ${kitId} (SKU: ${item.sku}) in order ${shopifyOrderId}`);
      processed.push({ kitId, success: false, error: 'kit_not_found' });
      continue;
    }

    // Create purchase record (idempotent)
    try {
      // Check if purchase already exists for this order line item
      const existingPurchase = await storage.getCreatorstackPurchaseByShopifyOrderLineItem(
        shopifyOrderId.toString(),
        item.id.toString()
      );

      if (existingPurchase) {
        console.log(`[CreatorStack] Purchase already exists for order ${shopifyOrderId} line item ${item.id}`);
        processed.push({ kitId, success: true });
        continue;
      }

      // Create new purchase
      await storage.createCreatorstackPurchase({
        buyerId: buyer.id,
        kitId,
        shopifyOrderId: shopifyOrderId.toString(),
        shopifyLineItemId: item.id.toString(),
        amountPaid: item.price, // Decimal string format
        accessGranted: true, // Grant access immediately on purchase
        accessGrantedAt: new Date(),
      });

      console.log(`✅ [CreatorStack] Created purchase: Buyer ${email} → Kit ${kit.name}`);
      processed.push({ kitId, success: true });
    } catch (error: any) {
      console.error(`[CreatorStack] Failed to create purchase for kit ${kitId}:`, error);
      processed.push({ kitId, success: false, error: error.message });
    }
  }

  // Success only if ALL items processed successfully
  const allSuccessful = processed.every(item => item.success);
  
  return {
    success: allSuccessful,
    buyerEmail: email,
    buyerId: buyer.id,
    processedItems: processed,
    error: allSuccessful ? undefined : 'One or more items failed to process',
  };
}
