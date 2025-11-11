import "dotenv/config";
import { 
  getWallPrintBlueprints, 
  getPrintProviders, 
  getVariants,
  getShops 
} from "../lib/printify";

async function checkPrintifyCatalog() {
  console.log("\n🎨 Checking Printify Catalog\n");
  console.log("=".repeat(60));

  try {
    // 1. Get shops
    console.log("\n📦 Fetching Printify shops...");
    const shops = await getShops();
    console.log(`   Found ${shops.length} shop(s):`);
    shops.forEach(shop => {
      console.log(`   - ${shop.title} (ID: ${shop.id})`);
    });

    const shopId = shops[0].id;

    // 2. Get wall print blueprints
    console.log("\n🖼️  Fetching wall print blueprints...");
    const wallPrints = await getWallPrintBlueprints();
    
    console.log(`\n   Found ${wallPrints.length} wall print blueprints:\n`);

    // Group by product type
    const byType: Record<string, any[]> = {
      "Posters/Prints": [],
      "Canvas": [],
      "Metal Prints": [],
      "Framed Prints": [],
      "Acrylic": [],
      "Wood": [],
      "Other": [],
    };

    wallPrints.forEach(blueprint => {
      const title = blueprint.title.toLowerCase();
      
      if (title.includes("poster") || title.includes("enhanced matte") || title.includes("premium matte")) {
        byType["Posters/Prints"].push(blueprint);
      } else if (title.includes("canvas")) {
        byType["Canvas"].push(blueprint);
      } else if (title.includes("metal")) {
        byType["Metal Prints"].push(blueprint);
      } else if (title.includes("framed")) {
        byType["Framed Prints"].push(blueprint);
      } else if (title.includes("acrylic")) {
        byType["Acrylic"].push(blueprint);
      } else if (title.includes("wood")) {
        byType["Wood"].push(blueprint);
      } else {
        byType["Other"].push(blueprint);
      }
    });

    // Print categorized blueprints
    for (const [category, blueprints] of Object.entries(byType)) {
      if (blueprints.length === 0) continue;
      
      console.log(`\n   ${category} (${blueprints.length}):`);
      blueprints.forEach(bp => {
        console.log(`      • ${bp.title} (ID: ${bp.id})`);
      });
    }

    // 3. Get detailed info for one blueprint of each type
    console.log("\n" + "=".repeat(60));
    console.log("📊 DETAILED BLUEPRINT ANALYSIS");
    console.log("=".repeat(60));

    for (const [category, blueprints] of Object.entries(byType)) {
      if (blueprints.length === 0) continue;
      
      const blueprint = blueprints[0]; // Take first one
      console.log(`\n📋 ${category}: ${blueprint.title}`);
      console.log(`   Blueprint ID: ${blueprint.id}`);
      console.log(`   Description: ${blueprint.description || "N/A"}`);

      try {
        // Get providers
        const providers = await getPrintProviders(blueprint.id);
        console.log(`   Providers: ${providers.length}`);
        
        if (providers.length > 0) {
          const provider = providers[0];
          console.log(`      • ${provider.title} (ID: ${provider.id})`);

          // Get variants
          const variantsData = await getVariants(blueprint.id, provider.id);
          const variants = variantsData.variants || [];
          
          console.log(`   Variants: ${variants.length}`);
          
          if (variants.length > 0) {
            console.log(`   Sample sizes:`);
            variants.slice(0, 5).forEach((v: any) => {
              console.log(`      • ${v.title} - Cost: $${(v.cost / 100).toFixed(2)}`);
            });
            
            if (variants.length > 5) {
              console.log(`      ... and ${variants.length - 5} more sizes`);
            }
          }
        }
      } catch (error: any) {
        console.log(`   ⚠️  Error getting details: ${error.message}`);
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("✅ CATALOG CHECK COMPLETE");
    console.log("=".repeat(60) + "\n");

  } catch (error: any) {
    console.error("❌ Error:", error.message);
    throw error;
  }
}

checkPrintifyCatalog()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });
