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
import { DpiValidatorService } from "./dpi-validator-service";
import { PRINTIFY_PRODUCTS } from "@shared/financial-utils";

let cachedShopId: string | null = null;

interface PrintifyVariant {
  id: number;
  title: string;
  cost: number;
}

interface MappedVariant {
  id: number;
  price: number;
  variantKey: string;
  title: string;
}

function parsePrintifyDimensions(title: string): { width: number; height: number } | null {
  const match = title.match(/(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)/i);
  if (!match) return null;
  
  const dim1 = parseFloat(match[1]);
  const dim2 = parseFloat(match[2]);
  
  return {
    width: Math.min(dim1, dim2),
    height: Math.max(dim1, dim2)
  };
}

function matchPrintifyVariantsToQualified(
  printifyVariants: PrintifyVariant[],
  qualifiedKeys: string[]
): MappedVariant[] {
  const matched: MappedVariant[] = [];
  const variantDimensions = DpiValidatorService.getAllVariantDimensions();
  
  for (const qualifiedKey of qualifiedKeys) {
    const expectedDims = variantDimensions.get(qualifiedKey);
    if (!expectedDims) {
      console.warn(`No dimensions found for variant key: ${qualifiedKey}`);
      continue;
    }
    
    const normalizedExpected = {
      width: Math.min(expectedDims.width, expectedDims.height),
      height: Math.max(expectedDims.width, expectedDims.height)
    };
    
    const printifyVariant = printifyVariants.find(pv => {
      const dims = parsePrintifyDimensions(pv.title);
      if (!dims) return false;
      
      const tolerance = 0.5;
      return (
        Math.abs(dims.width - normalizedExpected.width) <= tolerance &&
        Math.abs(dims.height - normalizedExpected.height) <= tolerance
      );
    });
    
    if (printifyVariant) {
      const productInfo = PRINTIFY_PRODUCTS[qualifiedKey];
      const price = productInfo?.suggestedRetail 
        ? Math.floor(productInfo.suggestedRetail * 100)
        : Math.ceil(printifyVariant.cost * 2.5);
      
      matched.push({
        id: printifyVariant.id,
        price,
        variantKey: qualifiedKey,
        title: printifyVariant.title
      });
      
      console.log(`✓ Matched ${qualifiedKey} (${normalizedExpected.width}×${normalizedExpected.height}") to Printify variant: ${printifyVariant.title}`);
    } else {
      console.warn(`⚠ No Printify variant found for ${qualifiedKey} (${normalizedExpected.width}×${normalizedExpected.height}")`);
    }
  }
  
  return matched;
}

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
 * Creates products only for variants that meet DPI quality requirements
 */
export async function createWallArtProducts(
  imageUrl: string, 
  title: string, 
  imageWidth: number,
  imageHeight: number,
  description?: string
) {
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

  // Step 4: Determine which variants qualify based on image dimensions
  const qualifiedKeys = DpiValidatorService.getQualifiedVariantKeys(imageWidth, imageHeight);
  console.log(`Image ${imageWidth}×${imageHeight}px qualifies for ${qualifiedKeys.length} variants:`, qualifiedKeys);
  
  if (qualifiedKeys.length === 0) {
    throw new Error("Image resolution too low - no product variants qualify for print quality standards");
  }

  // Step 5: Get variants (sizes) for this blueprint+provider
  const variantsData = await getVariants(posterBlueprint.id, provider.id);
  
  if (!variantsData.variants || variantsData.variants.length === 0) {
    throw new Error("No variants found for this blueprint and provider");
  }

  // Step 6: Match Printify variants to qualified variant keys
  const matchedVariants = matchPrintifyVariantsToQualified(
    variantsData.variants as PrintifyVariant[],
    qualifiedKeys
  );
  
  if (matchedVariants.length === 0) {
    throw new Error("No Printify variants matched the qualified sizes - catalog mismatch");
  }
  
  console.log(`Matched ${matchedVariants.length} Printify variants for qualified sizes`);
  
  const selectedVariants = matchedVariants.map(v => ({
    id: v.id,
    price: v.price
  }));

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
