/**
 * Printify Service - High-level operations for POD products
 * Handles artwork-to-product workflows
 */

import {
  getShops,
  uploadImage,
  getWallPrintBlueprints,
  getPrintProviders,
  getVariants,
  createProduct as createPrintifyProduct,
  publishProduct,
  isPrintifyConfigured,
} from "./printify";

let cachedShopId: string | null = null;

/**
 * Get the Printify shop ID (cached after first fetch)
 */
async function getShopId(): Promise<string> {
  if (cachedShopId) {
    return cachedShopId as string;
  }

  const shops = await getShops();
  if (!shops || shops.length === 0) {
    throw new Error("No Printify shops found");
  }

  cachedShopId = shops[0].id;
  return shops[0].id;
}

/**
 * Create wall art products from artwork image
 * For MVP: Creates a poster product
 * Future: Will create multiple product types (canvas, framed, metal, etc.)
 */
export async function createWallArtProducts(imageUrl: string, title: string, description?: string) {
  if (!isPrintifyConfigured()) {
    throw new Error("Printify is not configured");
  }

  const shopId = await getShopId();

  // Step 1: Upload image to Printify
  console.log("Uploading image to Printify...");
  const uploadedImage = await uploadImage(imageUrl, `${title}.jpg`);
  const printifyImageId: string = uploadedImage.id;

  console.log("Image uploaded:", printifyImageId);

  // Step 2: Get wall print blueprints
  console.log("Fetching wall print blueprints...");
  const wallPrints = await getWallPrintBlueprints();
  
  if (wallPrints.length === 0) {
    throw new Error("No wall print blueprints found");
  }

  // For MVP: Use the first poster/print blueprint we find
  // Common poster blueprint IDs: 3, 6, 19, 384 (these vary by region)
  const posterBlueprint = wallPrints.find(
    b => b.title.toLowerCase().includes("poster") || 
         b.title.toLowerCase().includes("print") ||
         b.title.toLowerCase().includes("enhanced matte")
  ) || wallPrints[0];

  console.log(`Using blueprint: ${posterBlueprint.title} (ID: ${posterBlueprint.id})`);

  // Step 3: Get print providers for this blueprint
  const providers = await getPrintProviders(posterBlueprint.id);
  if (providers.length === 0) {
    throw new Error(`No print providers found for blueprint ${posterBlueprint.id}`);
  }

  // Use first provider (usually most reliable)
  const provider = providers[0];
  console.log(`Using provider: ${provider.title} (ID: ${provider.id})`);

  // Step 4: Get variants (sizes) for this blueprint+provider
  const variantsData = await getVariants(posterBlueprint.id, provider.id);
  
  if (!variantsData.variants || variantsData.variants.length === 0) {
    throw new Error("No variants found for this blueprint and provider");
  }

  // Step 5: Select common poster sizes and set pricing
  // Common sizes: 8x10, 11x14, 16x20, 18x24, 24x36
  const selectedVariants = (variantsData.variants as any[])
    .filter((v) => {
      // Filter for common sizes - adjust as needed
      const title = v.title?.toLowerCase() || "";
      return (
        title.includes("8") ||
        title.includes("11") ||
        title.includes("16") ||
        title.includes("18") ||
        title.includes("24")
      );
    })
    .slice(0, 10) // Limit to 10 variants for MVP
    .map((v) => ({
      id: v.id,
      price: Math.ceil((v.cost || 1000) * 2.5), // 2.5x markup (adjust as needed)
    }));

  if (selectedVariants.length === 0) {
    // Fallback: use all available variants
    console.warn("No common sizes found, using all variants");
    (variantsData.variants as any[]).slice(0, 10).forEach((v) => {
      selectedVariants.push({
        id: v.id,
        price: Math.ceil((v.cost || 1000) * 2.5),
      });
    });
  }

  console.log(`Selected ${selectedVariants.length} variants`);

  // Step 6: Build print areas (where the artwork goes)
  // Placeholders is an array of {position: "front", height: X, width: Y}
  const firstVariantPlaceholders = (variantsData.variants as any[])[0]?.placeholders;
  const printAreas = Array.isArray(firstVariantPlaceholders) && firstVariantPlaceholders.length > 0
    ? firstVariantPlaceholders.map((placeholder: any) => ({
        variant_ids: selectedVariants.map(v => v.id),
        placeholders: [{
          position: placeholder.position || "front", // Use actual position from API
          images: [{
            id: printifyImageId,
            x: 0.5, // Center
            y: 0.5, // Center
            scale: 1.0, // Full coverage
            angle: 0,
          }],
        }],
      }))
    : [{
        // Fallback: assume front position
        variant_ids: selectedVariants.map(v => v.id),
        placeholders: [{
          position: "front",
          images: [{
            id: printifyImageId,
            x: 0.5,
            y: 0.5,
            scale: 1.0,
            angle: 0,
          }],
        }],
      }];

  // Step 7: Create the product
  console.log("Creating Printify product...");
  const product = await createPrintifyProduct(shopId, {
    title,
    description,
    blueprint_id: posterBlueprint.id,
    print_provider_id: provider.id,
    variants: selectedVariants,
    print_areas: printAreas,
  });

  console.log("Product created:", product.id);

  // Step 8: Publish the product (makes it available for orders)
  try {
    await publishProduct(shopId, product.id);
    console.log("Product published successfully");
  } catch (error) {
    console.warn("Failed to publish product:", error);
    // Continue anyway - product is created even if publishing fails
  }

  return {
    printifyProductId: product.id,
    printifyImageId,
    blueprintId: posterBlueprint.id,
    blueprintTitle: posterBlueprint.title,
    providerId: provider.id,
    providerTitle: provider.title,
    variantCount: selectedVariants.length,
  };
}
