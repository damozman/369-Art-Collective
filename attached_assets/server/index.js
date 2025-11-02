
import 'dotenv/config';
import express from 'express';
import { createShopifyProduct } from './lib/shopify.js';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '25mb' }));

// Health
app.get('/health', (req, res) => res.json({ ok: true }));

// Approve an artwork -> create Shopify product (Draft)
app.post('/api/admin/approve', async (req, res) => {
  try {
    const { artistName, artistShort, artworkId, title, imageUrl } = req.body;
    if (!artistName || !artistShort || !artworkId || !title || !imageUrl) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Load config
    const cfgPath = p => path.join(__dirname, '..', 'config', p);
    const providerConfig = JSON.parse(await readFile(cfgPath('provider_config.json'), 'utf-8'));
    const pricing = JSON.parse(await readFile(cfgPath('pricing_matrix.json'), 'utf-8'));
    const weights = JSON.parse(await readFile(cfgPath('weights_lb.json'), 'utf-8'));

    const finishes = ['Paper','Canvas']; // Phase 1 live
    const sizes = providerConfig.sizes;

    // Build variants
    const variants = [];
    for (const finish of finishes) {
      for (const size of sizes) {
        variants.push({
          option1: size,
          option2: finish,
          price: String(pricing[finish][size].toFixed(2)),
          sku: `ART-${artistShort}-${artworkId}-${size}-${finish}`,
          inventory_management: null,
          inventory_policy: 'continue',
          weight: weights[finish][size],
          weight_unit: 'lb',
          metafields: [
            { namespace: '247pn', key: 'size', value: size, type: 'single_line_text_field' },
            { namespace: '247pn', key: 'finish', value: finish, type: 'single_line_text_field' }
          ]
        });
      }
    }

    const tags = [
      'New',
      ...Array.from(new Set(finishes.map(f => `Finish:${f}`))),
      `Artist:${artistName}`
    ];

    const productPayload = {
      product: {
        title,
        body_html: `<p>${title} by ${artistName}</p>`,
        vendor: artistName,
        product_type: 'Art Print',
        status: 'draft',
        tags,
        options: [
          { name: 'Size', values: providerConfig.sizes },
          { name: 'Finish', values: finishes }
        ],
        images: [{ src: imageUrl, alt: title }],
        variants
      }
    };

    const result = await createShopifyProduct(productPayload);

    // Attach product-level metafields
    const productId = result?.product?.id || result?.id;
    await fetch(`https://${process.env.SHOPIFY_STORE_URL}/admin/api/2024-10/metafields.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN
      },
      body: JSON.stringify({
        metafield: { namespace:'247pn', key:'artist_id', type:'single_line_text_field', value: artistShort }
      })
    });
    await fetch(`https://${process.env.SHOPIFY_STORE_URL}/admin/api/2024-10/metafields.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN
      },
      body: JSON.stringify({
        metafield: { namespace:'247pn', key:'artwork_id', type:'single_line_text_field', value: String(artworkId) }
      })
    });
    await fetch(`https://${process.env.SHOPIFY_STORE_URL}/admin/api/2024-10/metafields.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN
      },
      body: JSON.stringify({
        metafield: { namespace:'247pn', key:'provider', type:'single_line_text_field', value: 'manual' }
      })
    });

    res.json({ ok: true, product: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal error', detail: String(err) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`247PN approval server running on :${PORT}`));
