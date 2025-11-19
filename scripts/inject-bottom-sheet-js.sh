#!/bin/bash

# Script to automatically inject mobile bottom sheet JavaScript into Shopify theme
# Usage: ./scripts/inject-bottom-sheet-js.sh

set -e

echo "🚀 Starting automated bottom sheet JavaScript injection..."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Pull current theme from Shopify
echo -e "${BLUE}📥 Step 1: Pulling current theme from Shopify...${NC}"
cd attached_assets/theme
shopify theme pull --path . --only "sections/main-product.liquid"

# Step 2: Check if file exists
if [ ! -f "sections/main-product.liquid" ]; then
    echo -e "${YELLOW}⚠️  main-product.liquid not found. Trying product.liquid...${NC}"
    shopify theme pull --path . --only "templates/product.liquid"
    TARGET_FILE="templates/product.liquid"
else
    TARGET_FILE="sections/main-product.liquid"
fi

# Step 3: Check if JavaScript already exists
if grep -q "initBottomSheet" "$TARGET_FILE"; then
    echo -e "${YELLOW}⚠️  Bottom sheet JavaScript already exists in $TARGET_FILE${NC}"
    echo -e "${YELLOW}Skipping injection to avoid duplicates.${NC}"
    exit 0
fi

# Step 4: Inject JavaScript before closing tag
echo -e "${BLUE}💉 Step 2: Injecting JavaScript into $TARGET_FILE...${NC}"

# Create backup
cp "$TARGET_FILE" "$TARGET_FILE.backup"

# Find the last closing tag and inject before it
INJECT_CODE='
<script>
(function() {
  // Wait for DOM to be ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initBottomSheet);
  } else {
    initBottomSheet();
  }

  function initBottomSheet() {
    // Only run on mobile (max-width: 900px)
    if (window.innerWidth > 900) return;

    const bottomSheet = document.querySelector("section.pn247-art-product .product__info");
    if (!bottomSheet) return;

    // Toggle expanded state on tap anywhere on bottom sheet
    bottomSheet.addEventListener("click", function(e) {
      // Don'\''t toggle if clicking inside form elements
      if (e.target.tagName === "INPUT" || 
          e.target.tagName === "BUTTON" || 
          e.target.tagName === "SELECT") {
        return;
      }
      
      this.classList.toggle("expanded");
    });

    // Swipe gesture support
    let touchStartY = 0;
    let touchStartTime = 0;

    bottomSheet.addEventListener("touchstart", function(e) {
      touchStartY = e.touches[0].clientY;
      touchStartTime = Date.now();
    }, { passive: true });

    bottomSheet.addEventListener("touchend", function(e) {
      const touchEndY = e.changedTouches[0].clientY;
      const touchDuration = Date.now() - touchStartTime;
      const swipeDistance = touchStartY - touchEndY;

      // Only count as swipe if quick (< 300ms) and significant distance (> 50px)
      if (touchDuration < 300) {
        if (swipeDistance > 50) {
          // Swipe up = expand
          this.classList.add("expanded");
        } else if (swipeDistance < -50) {
          // Swipe down = collapse
          this.classList.remove("expanded");
        }
      }
    }, { passive: true });

    // Re-check on window resize
    window.addEventListener("resize", function() {
      if (window.innerWidth > 900) {
        bottomSheet.classList.remove("expanded");
      }
    });
  }
})();
</script>'

# Use awk to inject before the last closing tag
awk -v inject="$INJECT_CODE" '
    /<\/(section|div)>/ { 
        if (!injected && NR > 10) {  # Only inject near end of file
            print inject
            injected = 1
        }
    }
    { print }
' "$TARGET_FILE.backup" > "$TARGET_FILE"

echo -e "${GREEN}✅ JavaScript injected successfully!${NC}"

# Step 5: Push changes back to Shopify
echo -e "${BLUE}📤 Step 3: Pushing changes back to Shopify...${NC}"
shopify theme push --path . --only "$TARGET_FILE"

echo -e "${GREEN}✅ Done! Mobile bottom sheet JavaScript is now live on your Shopify store!${NC}"
echo -e "${BLUE}📱 Test it on mobile: Visit any product page and tap the bottom sheet${NC}"
echo -e "${YELLOW}💾 Backup saved: $TARGET_FILE.backup${NC}"

cd ../..
