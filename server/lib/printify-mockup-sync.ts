/**
 * Printify Mockup Sync Service
 * Automatically syncs Printify-generated mockup images to Shopify products
 */

import { getProductMockups } from "./printify";
import { addProductImages } from "./shopify";

interface SyncResult {
  success: boolean;
  mockupsFound: number;
  mockupsAdded: number;
  errors: string[];
}

/**
 * Sync Printify mockup images to a Shopify product
 * 
 * @param printifyShopId - Printify shop ID
 * @param printifyProductId - Printify product ID
 * @param shopifyProductId - Shopify product ID
 * @param retryDelay - Optional delay in milliseconds before fetching mockups (default: 8000ms)
 * 
 * @returns SyncResult with status and counts
 * 
 * @example
 * const result = await syncPrintifyMockupsToShopify(
 *   "shop123",
 *   "printify456", 
 *   "shopify789"
 * );
 * console.log(`Added ${result.mockupsAdded} mockup images`);
 */
export async function syncPrintifyMockupsToShopify(
  printifyShopId: string,
  printifyProductId: string,
  shopifyProductId: string,
  retryDelay: number = 8000
): Promise<SyncResult> {
  const result: SyncResult = {
    success: false,
    mockupsFound: 0,
    mockupsAdded: 0,
    errors: [],
  };

  try {
    // Wait for Printify to generate mockups (async process)
    console.log(`[Mockup Sync] Waiting ${retryDelay}ms for mockup generation...`);
    await new Promise(resolve => setTimeout(resolve, retryDelay));

    // Fetch mockups from Printify
    console.log(`[Mockup Sync] Fetching mockups from Printify product ${printifyProductId}...`);
    const mockups = await getProductMockups(printifyShopId, printifyProductId);
    
    result.mockupsFound = mockups.length;
    console.log(`[Mockup Sync] Found ${mockups.length} mockup images`);

    if (mockups.length === 0) {
      result.errors.push("No mockup images found - they may still be generating");
      return result;
    }

    // Prepare images for Shopify
    // Filter out the default image (already added during product creation)
    // and prepare remaining mockups
    const imagesToAdd = mockups
      .filter(mockup => !mockup.is_default) // Skip default image (already in Shopify)
      .map((mockup, index) => ({
        src: mockup.src,
        alt: `Product mockup - ${mockup.position}`,
        position: index + 2, // Position 1 is the original artwork
      }));

    if (imagesToAdd.length === 0) {
      console.log("[Mockup Sync] Only default image found, skipping sync");
      result.success = true;
      return result;
    }

    // Add mockup images to Shopify
    console.log(`[Mockup Sync] Adding ${imagesToAdd.length} mockup images to Shopify product ${shopifyProductId}...`);
    const addedImages = await addProductImages(shopifyProductId, imagesToAdd);
    
    result.mockupsAdded = addedImages.length;
    result.success = true;

    console.log(`[Mockup Sync] Successfully added ${result.mockupsAdded} mockup images`);
    return result;
  } catch (error: any) {
    console.error("[Mockup Sync] Error syncing mockups:", error);
    result.errors.push(error.message || "Unknown error");
    return result;
  }
}

/**
 * Retry mockup sync with exponential backoff
 * Useful when mockups aren't ready immediately after product creation
 * 
 * @param printifyShopId - Printify shop ID
 * @param printifyProductId - Printify product ID  
 * @param shopifyProductId - Shopify product ID
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * 
 * @returns SyncResult with status and counts
 */
export async function syncPrintifyMockupsWithRetry(
  printifyShopId: string,
  printifyProductId: string,
  shopifyProductId: string,
  maxRetries: number = 3
): Promise<SyncResult> {
  const delays = [5000, 10000, 15000]; // 5s, 10s, 15s
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const delay = delays[attempt] || 15000;
    
    console.log(`[Mockup Sync] Attempt ${attempt + 1}/${maxRetries}...`);
    const result = await syncPrintifyMockupsToShopify(
      printifyShopId,
      printifyProductId,
      shopifyProductId,
      delay
    );

    if (result.success && result.mockupsAdded > 0) {
      return result;
    }

    if (attempt < maxRetries - 1) {
      console.log(`[Mockup Sync] No mockups added, will retry in ${delay}ms...`);
    }
  }

  console.warn("[Mockup Sync] Max retries reached, mockups may not be available yet");
  return {
    success: false,
    mockupsFound: 0,
    mockupsAdded: 0,
    errors: ["Max retries reached - mockups not yet available"],
  };
}
