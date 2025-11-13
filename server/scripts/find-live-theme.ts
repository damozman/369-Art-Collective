import "dotenv/config";

const shopifyShopUrl = process.env.SHOPIFY_SHOP_URL || "";
const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || "";
const apiVersion = "2025-01";

async function findLiveTheme() {
  console.log("\n🔍 Finding Your Live Shopify Theme\n");
  console.log("=".repeat(60));

  if (!shopifyShopUrl || !shopifyAccessToken) {
    console.error("\n❌ Shopify credentials not configured");
    process.exit(1);
  }

  const url = `https://${shopifyShopUrl}/admin/api/${apiVersion}/themes.json`;
  const response = await fetch(url, {
    headers: { "X-Shopify-Access-Token": shopifyAccessToken },
  });

  if (!response.ok) {
    console.error("\n❌ Failed to fetch themes");
    process.exit(1);
  }

  const data = await response.json();
  const themes = data.themes || [];

  console.log(`\n📋 Found ${themes.length} themes:\n`);

  for (const theme of themes) {
    const isLive = theme.role === "main";
    const icon = isLive ? "🟢 LIVE" : theme.role === "development" ? "🔵 DEV" : "⚪";
    
    console.log(`${icon} ${theme.name}`);
    console.log(`   ID: ${theme.id}`);
    console.log(`   Role: ${theme.role}`);
    console.log(`   Updated: ${new Date(theme.updated_at).toLocaleString()}`);
    console.log();
  }

  const liveTheme = themes.find((t: any) => t.role === "main");
  
  if (liveTheme) {
    console.log("=".repeat(60));
    console.log("\n✅ YOUR LIVE THEME:\n");
    console.log(`Name: ${liveTheme.name}`);
    console.log(`ID: ${liveTheme.id}`);
    console.log(`\n📝 To deploy hero slider to this theme:\n`);
    console.log(`cd attached_assets/theme`);
    console.log(`shopify theme push \\`);
    console.log(`  --store=${shopifyShopUrl} \\`);
    console.log(`  --theme=${liveTheme.id} \\`);
    console.log(`  --allow-live \\`);
    console.log(`  --only sections/247-homepage-hero.liquid\n`);
  } else {
    console.log("⚠️ No live theme found!");
  }
}

findLiveTheme().catch(console.error);
