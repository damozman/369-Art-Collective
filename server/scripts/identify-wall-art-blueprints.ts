import "dotenv/config";
import { 
  getWallPrintBlueprints, 
  getPrintProviders, 
  getVariants 
} from "../lib/printify";

interface WallArtOption {
  category: "poster" | "canvas" | "framed" | "metal";
  blueprintId: number;
  blueprintTitle: string;
  providerId: number;
  providerTitle: string;
  variantCount: number;
  sampleSizes: string[];
  avgCost: number;
}

async function identifyBestWallArtOptions() {
  console.log("\n🎨 Identifying Best Wall Art Blueprints\n");
  console.log("=".repeat(60));

  const wallPrints = await getWallPrintBlueprints();
  const bestOptions: WallArtOption[] = [];

  // Define what we're looking for
  const targetBlueprints = [
    // POSTERS - Look for basic matte/satin posters
    { keywords: ["matte posters", "satin posters"], category: "poster" as const, limit: 2 },
    
    // CANVAS - Look for stretched canvas
    { keywords: ["stretched canvas", "classic canvas", "canvas stretched"], category: "canvas" as const, limit: 2 },
    
    // FRAMED - Look for framed posters
    { keywords: ["framed poster", "framed posters"], category: "framed" as const, limit: 2 },
    
    // METAL - Look for metal signs/art
    { keywords: ["metal art sign", "metal sign"], category: "metal" as const, limit: 1 },
  ];

  for (const target of targetBlueprints) {
    console.log(`\n📋 Searching for ${target.category.toUpperCase()}...`);
    
    for (const keyword of target.keywords) {
      const matches = wallPrints.filter(bp => 
        bp.title.toLowerCase().includes(keyword.toLowerCase())
      );

      for (const blueprint of matches.slice(0, target.limit)) {
        try {
          console.log(`\n   Analyzing: ${blueprint.title} (ID: ${blueprint.id})`);
          
          const providers = await getPrintProviders(blueprint.id);
          if (providers.length === 0) {
            console.log(`      ⚠️  No providers available`);
            continue;
          }

          const provider = providers[0];
          const variantsData = await getVariants(blueprint.id, provider.id);
          const variants = variantsData.variants || [];

          if (variants.length === 0) {
            console.log(`      ⚠️  No variants available`);
            continue;
          }

          // Calculate average cost
          const costs = variants.map((v: any) => v.cost || 0).filter((c: number) => c > 0);
          const avgCost = costs.length > 0 ? costs.reduce((a: number, b: number) => a + b, 0) / costs.length : 0;

          // Get sample sizes
          const sampleSizes = variants.slice(0, 5).map((v: any) => v.title);

          const option: WallArtOption = {
            category: target.category,
            blueprintId: blueprint.id,
            blueprintTitle: blueprint.title,
            providerId: provider.id,
            providerTitle: provider.title,
            variantCount: variants.length,
            sampleSizes,
            avgCost: avgCost / 100, // Convert cents to dollars
          };

          bestOptions.push(option);

          console.log(`      ✓ Provider: ${provider.title}`);
          console.log(`      ✓ Variants: ${variants.length}`);
          console.log(`      ✓ Avg Cost: $${option.avgCost.toFixed(2)}`);
          console.log(`      ✓ Sample Sizes: ${sampleSizes.slice(0, 3).join(", ")}`);

          break; // Found a good one for this keyword
        } catch (error: any) {
          console.log(`      ⚠️  Error: ${error.message}`);
        }
      }
    }
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 RECOMMENDED BLUEPRINTS");
  console.log("=".repeat(60) + "\n");

  const grouped = bestOptions.reduce((acc, opt) => {
    if (!acc[opt.category]) acc[opt.category] = [];
    acc[opt.category].push(opt);
    return acc;
  }, {} as Record<string, WallArtOption[]>);

  for (const [category, options] of Object.entries(grouped)) {
    console.log(`\n${category.toUpperCase()}:`);
    options.forEach((opt, i) => {
      console.log(`\n   Option ${i + 1}: ${opt.blueprintTitle}`);
      console.log(`   Blueprint ID: ${opt.blueprintId}`);
      console.log(`   Provider: ${opt.providerTitle} (ID: ${opt.providerId})`);
      console.log(`   Variants: ${opt.variantCount} sizes`);
      console.log(`   Avg Cost: $${opt.avgCost.toFixed(2)}`);
      console.log(`   Sizes: ${opt.sampleSizes.slice(0, 3).join(", ")}${opt.sampleSizes.length > 3 ? "..." : ""}`);
    });
  }

  console.log("\n" + "=".repeat(60));
  console.log("✅ ANALYSIS COMPLETE");
  console.log("=".repeat(60) + "\n");

  // Save recommendations
  console.log("💡 RECOMMENDATION:\n");
  console.log("Update server/lib/product-types.ts with these Printify blueprints:");
  console.log("const PRINTIFY_BLUEPRINTS = {");
  
  for (const [category, options] of Object.entries(grouped)) {
    if (options.length > 0) {
      const opt = options[0]; // Use first option as default
      console.log(`  ${category}: {`);
      console.log(`    blueprintId: ${opt.blueprintId}, // ${opt.blueprintTitle}`);
      console.log(`    providerId: ${opt.providerId}, // ${opt.providerTitle}`);
      console.log(`  },`);
    }
  }
  console.log("};\n");
}

identifyBestWallArtOptions()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });
