
import fetch from 'node-fetch';

export async function createShopifyProduct(payload) {
  const url = `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2024-10/products.json`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify error ${res.status}: ${text}`);
  }
  return await res.json();
}
