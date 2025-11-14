# Displate-Style Mockup System Specification

## Overview
Two-stage product page with full-width hero mockup showing artwork in realistic room scenes, synchronized with detailed configurator below.

---

## Layout Architecture

### Stage 1: Full-Width Hero Mockup Section
```
┌────────────────────────────────────────────────────────────────┐
│  HERO MOCKUP SECTION (Full viewport width, ~600-800px height) │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │         Room Scene Background Image                       │ │
│  │                                                            │ │
│  │         ┌─────────────────┐                               │ │
│  │         │  Product Image  │  ← Overlaid artwork           │ │
│  │         │  + Frame Layer  │     positioned dynamically    │ │
│  │         └─────────────────┘                               │ │
│  │                                                            │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  [◀ Previous Room]  [Room Selector Dots]  [Next Room ▶]      │
└────────────────────────────────────────────────────────────────┘

### Stage 2: Existing Product Details (Current 3-Column Layout)
┌────────────────────────────────────────────────────────────────┐
│  ┌──────┐  ┌─────────────────────┐  ┌────────────────────────┐│
│  │Thumbs│  │   Main Gallery      │  │   Configurator         ││
│  │      │  │   (Alternate Views) │  │   (Size/Frame/Price)   ││
│  └──────┘  └─────────────────────┘  └────────────────────────┘│
└────────────────────────────────────────────────────────────────┘
```

---

## Mockup Template Data Model

### Per-Product Metafields (Shopify Custom Fields)

```json
{
  "mockup_templates": [
    {
      "id": "living-room-modern",
      "name": "Modern Living Room",
      "desktop_url": "https://cdn.shopify.com/mockups/living-room-wall.jpg",
      "mobile_url": "https://cdn.shopify.com/mockups/living-room-wall-mobile.jpg",
      "overlay_position": {
        "x": "35%",
        "y": "25%"
      },
      "base_width": "400px",
      "alignment": "center"
    },
    {
      "id": "bedroom-cozy",
      "name": "Cozy Bedroom",
      "desktop_url": "https://cdn.shopify.com/mockups/bedroom-wall.jpg",
      "mobile_url": "https://cdn.shopify.com/mockups/bedroom-wall-mobile.jpg",
      "overlay_position": {
        "x": "40%",
        "y": "20%"
      },
      "base_width": "350px",
      "alignment": "center"
    },
    {
      "id": "office-minimalist",
      "name": "Minimalist Office",
      "desktop_url": "https://cdn.shopify.com/mockups/office-wall.jpg",
      "mobile_url": "https://cdn.shopify.com/mockups/office-wall-mobile.jpg",
      "overlay_position": {
        "x": "30%",
        "y": "22%"
      },
      "base_width": "420px",
      "alignment": "center"
    },
    {
      "id": "gallery-wall",
      "name": "Gallery Wall",
      "desktop_url": "https://cdn.shopify.com/mockups/gallery-wall.jpg",
      "mobile_url": "https://cdn.shopify.com/mockups/gallery-wall-mobile.jpg",
      "overlay_position": {
        "x": "38%",
        "y": "18%"
      },
      "base_width": "380px",
      "alignment": "center"
    }
  ]
}
```

---

## Size Variant Scale Factors

Based on product size selections, the overlay artwork scales proportionally:

| Size Variant | Short Side (inches) | Scale Factor | CSS Scale |
|--------------|---------------------|--------------|-----------|
| 8x10         | 8                   | 0.60x        | `scale(0.60)` |
| 10x10        | 10                  | 0.75x        | `scale(0.75)` |
| 12x16        | 12                  | 1.00x        | `scale(1.00)` ← BASE |
| 16x16        | 16                  | 1.20x        | `scale(1.20)` |
| 18x24        | 18                  | 1.50x        | `scale(1.50)` |
| 24x36        | 24                  | 2.00x        | `scale(2.00)` |

**Formula**: `scale_factor = short_side / 12` (where 12x16 is our base reference)

---

## Frame Layer System

### Frame Asset Structure
```
/attached_assets/theme/assets/frames/
  ├── black-frame.png      (Transparent PNG with black frame border)
  ├── white-frame.png      (Transparent PNG with white frame border)
  └── wood-frame.png       (Optional: future expansion)
```

### CSS Layering
```html
<div class="mockup-overlay">
  <img src="product-image.jpg" class="overlay-artwork" />
  <img src="black-frame.png" class="overlay-frame" data-frame="black" />
  <img src="white-frame.png" class="overlay-frame" data-frame="white" style="display:none;" />
</div>
```

---

## Overlay Positioning Logic

### CSS Implementation
```css
.hero-mockup-container {
  position: relative;
  width: 100vw;
  height: 700px;
  overflow: hidden;
  background-size: cover;
  background-position: center;
}

.mockup-overlay {
  position: absolute;
  /* Position from metafields */
  left: var(--overlay-x, 35%);
  top: var(--overlay-y, 25%);
  transform: translate(-50%, -50%) scale(var(--size-scale, 1.0));
  transform-origin: center center;
  transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  
  /* Base dimensions */
  width: var(--base-width, 400px);
  aspect-ratio: var(--artwork-ratio, 1);
}
```

---

## Event Synchronization

### Shared State Management
```javascript
// Custom events fired by configurator
document.addEventListener('product-size-changed', (e) => {
  updateMockupScale(e.detail.scale);
});

document.addEventListener('product-frame-changed', (e) => {
  updateMockupFrame(e.detail.frame);
});

// Bidirectional sync: hero can also update configurator
function updateConfiguratorFromHero(sizeId, frameType) {
  document.dispatchEvent(new CustomEvent('mockup-selection-changed', {
    detail: { sizeId, frameType }
  }));
}
```

---

## Mobile Responsive Behavior

### Industry Standard (Displate Approach)
- **Desktop**: Full-width hero at ~700px height, product overlay at specified position
- **Tablet** (768px-1024px): Reduced hero height to 500px, slightly smaller overlay
- **Mobile** (<768px): 
  - Hero mockup: 400px height, uses mobile-optimized mockup image
  - Overlay: Centered, smaller scale factor (0.7x of desktop)
  - Room selector: Swipe gestures instead of arrows
  - 3-column section: Stacks vertically (thumbnails horizontal carousel, configurator full-width)

---

## Mockup Image Requirements

### Desktop Mockup Specs
- **Dimensions**: 1920px × 1200px (16:10 aspect ratio)
- **Focus area**: Product overlay positioned in clear wall space
- **Lighting**: Soft, even lighting to showcase artwork
- **Style**: Clean, professional, aspirational lifestyle imagery
- **File format**: JPG, optimized for web (~200-400KB)

### Mobile Mockup Specs
- **Dimensions**: 800px × 1000px (vertical orientation)
- **Focus area**: Product centered in upper 60% of image
- **File format**: JPG, optimized for web (~150-250KB)

### 4 Room Scene Templates Needed
1. **Modern Living Room**: Gray/white walls, minimalist furniture, good for larger pieces
2. **Cozy Bedroom**: Warm tones, above bed placement, intimate setting
3. **Home Office**: Clean desk, shelving, professional context
4. **Gallery Wall**: White wall, museum-style, shows artwork as fine art

---

## Implementation Priority

### Phase 1: Foundation (Current)
- [x] Define data model
- [ ] Update Liquid template structure
- [ ] Implement CSS layout and positioning
- [ ] Build JavaScript overlay engine

### Phase 2: Assets
- [ ] Generate/source 4 room mockup images
- [ ] Create frame overlay PNGs
- [ ] Test with sample products

### Phase 3: Polish
- [ ] Add room selector UI (arrows + dots)
- [ ] Implement smooth transitions
- [ ] Mobile optimization
- [ ] Performance testing

---

## Fallback Strategy

If mockup metafields are not configured for a product:
1. **Graceful degradation**: Hide hero mockup section entirely
2. **Show existing 3-column layout**: Product functions normally
3. **Admin notification**: Console warning for missing mockup data

This ensures backwards compatibility with products that don't have mockups configured yet.
