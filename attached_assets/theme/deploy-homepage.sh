#!/bin/bash
cd "$(dirname "$0")"
shopify theme push \
  --store=bvhpq0-hy.myshopify.com \
  --theme=179686146345 \
  --allow-live \
  --only \
    templates/index.json \
    sections/247-homepage-hero.liquid \
    sections/247-featured-artists.liquid \
    sections/247-featured-collections.liquid \
    sections/247-trust-badges.liquid \
    sections/247-artist-cta-banner.liquid
