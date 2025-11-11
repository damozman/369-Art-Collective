import "dotenv/config";

const shopifyShopUrl = process.env.SHOPIFY_SHOP_URL || "";
const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || "";
const apiVersion = "2025-01";

async function createFramedSmartCollection() {
  console.log("\n📁 Creating Finish: Framed Smart Collection\n");
  console.log("=".repeat(60));

  const url = `https://${shopifyShopUrl}/admin/api/${apiVersion}/smart_collections.json`;
  
  const collectionData = {
    smart_collection: {
      title: "Finish: Framed",
      rules: [
        {
          column: "tag",
          relation: "equals",
          condition: "Finish:Framed"
        }
      ],
      disjunctive: false, // AND logic (though only 1 rule)
    }
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": shopifyAccessToken,
    },
    body: JSON.stringify(collectionData),
  });

  if (!response.ok) {
    const error = await response.text();
    console.log(`❌ Failed to create collection: ${error}`);
    return;
  }

  const data = await response.json();
  const collection = data.smart_collection;

  console.log(`✅ Created smart collection!`);
  console.log(`   Title: ${collection.title}`);
  console.log(`   Handle: ${collection.handle}`);
  console.log(`   ID: ${collection.id}`);
  
  // Wait a moment for Shopify to index
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Check product count
  const countUrl = `https://${shopifyShopUrl}/admin/api/${apiVersion}/products/count.json?collection_id=${collection.id}`;
  const countResponse = await fetch(countUrl, {
    headers: { "X-Shopify-Access-Token": shopifyAccessToken },
  });

  if (countResponse.ok) {
    const countData = await countResponse.json();
    console.log(`   Products: ${countData.count}`);
  }

  console.log("\n" + "=".repeat(60) + "\n");
}

createFramedSmartCollection()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
