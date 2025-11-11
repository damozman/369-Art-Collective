/**
 * 247 Print Network - Product Gallery & Variant System
 * Handles multi-image gallery, variant switching, and zoom functionality
 * Optimized for Printify POD products with multiple mockups
 */

document.addEventListener('DOMContentLoaded', () => {
  // ===== IMAGE GALLERY SYSTEM =====
  const mainImages = document.querySelectorAll('.gallery__main-image');
  const thumbnails = document.querySelectorAll('.gallery__thumbnail');
  const zoomTrigger = document.getElementById('zoom-trigger');
  const lightbox = document.getElementById('image-lightbox');
  const lightboxImage = document.getElementById('lightbox-image');
  const lightboxClose = document.getElementById('lightbox-close');
  const lightboxPrev = document.getElementById('lightbox-prev');
  const lightboxNext = document.getElementById('lightbox-next');

  let currentImageIndex = 0;

  // Switch to specific image
  function showImage(index) {
    if (index < 0 || index >= mainImages.length) return;

    // Update main images
    mainImages.forEach((img, i) => {
      img.classList.toggle('active', i === index);
    });

    // Update thumbnails
    thumbnails.forEach((thumb, i) => {
      thumb.classList.toggle('active', i === index);
    });

    currentImageIndex = index;
  }

  // Thumbnail click handlers
  thumbnails.forEach((thumb, index) => {
    thumb.addEventListener('click', () => {
      showImage(index);
    });
  });

  // ===== LIGHTBOX ZOOM =====
  function openLightbox(index) {
    if (!mainImages[index]) return;
    
    const imageSrc = mainImages[index].src;
    const imageAlt = mainImages[index].alt;
    
    lightboxImage.src = imageSrc;
    lightboxImage.alt = imageAlt;
    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';
    currentImageIndex = index;
  }

  function closeLightbox() {
    lightbox.classList.remove('active');
    document.body.style.overflow = '';
  }

  function showPrevImage() {
    const newIndex = currentImageIndex > 0 ? currentImageIndex - 1 : mainImages.length - 1;
    currentImageIndex = newIndex;
    
    // Update lightbox image without reopening
    if (lightbox.classList.contains('active') && mainImages[newIndex]) {
      lightboxImage.src = mainImages[newIndex].src;
      lightboxImage.alt = mainImages[newIndex].alt;
    }
    
    // Update main gallery
    showImage(newIndex);
  }

  function showNextImage() {
    const newIndex = currentImageIndex < mainImages.length - 1 ? currentImageIndex + 1 : 0;
    currentImageIndex = newIndex;
    
    // Update lightbox image without reopening
    if (lightbox.classList.contains('active') && mainImages[newIndex]) {
      lightboxImage.src = mainImages[newIndex].src;
      lightboxImage.alt = mainImages[newIndex].alt;
    }
    
    // Update main gallery
    showImage(newIndex);
  }

  // Lightbox event handlers
  zoomTrigger?.addEventListener('click', () => openLightbox(currentImageIndex));
  lightboxClose?.addEventListener('click', closeLightbox);
  lightboxPrev?.addEventListener('click', showPrevImage);
  lightboxNext?.addEventListener('click', showNextImage);

  // Close lightbox on backdrop click
  lightbox?.addEventListener('click', (e) => {
    if (e.target === lightbox) closeLightbox();
  });

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (!lightbox?.classList.contains('active')) return;
    
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') showPrevImage();
    if (e.key === 'ArrowRight') showNextImage();
  });

  // ===== VARIANT TO IMAGE MAPPING =====
  // Build variant-to-image map from Printify's attached_to_variant data
  // Each image may be attached to multiple variants (e.g., different sizes of same finish)
  const variantImageMap = new Map();
  
  mainImages.forEach((img, index) => {
    const variantIds = img.dataset.variantIds;
    if (variantIds) {
      // Split comma-separated variant IDs and map each to this image
      variantIds.split(',').forEach(id => {
        const trimmedId = id.trim();
        if (trimmedId) {
          variantImageMap.set(trimmedId, index);
        }
      });
    }
  });

  // ===== VARIANT SELECTION SYSTEM =====
  const sizeOptions = document.querySelectorAll('[data-option-type="size"]');
  const finishOptions = document.querySelectorAll('[data-option-type="finish"]');
  const frameToggles = document.querySelectorAll('.frame-toggle');
  const variantIdInput = document.getElementById('selected-variant-id');
  const priceDisplay = document.getElementById('product-price');
  const addToCartButton = document.querySelector('.button--add-to-cart');

  // Get product variants from Shopify
  const productData = window.product || {};
  const variants = productData.variants || [];

  // Current selection state
  let selectedSize = null;
  let selectedFinish = null;
  let selectedFrame = 'none';

  // Initialize default selections
  function initializeSelections() {
    // Get default size
    const defaultSizeOption = document.querySelector('[data-option-type="size"] input:checked');
    selectedSize = defaultSizeOption?.value || null;

    // Get default finish
    const defaultFinishOption = document.querySelector('[data-option-type="finish"] input:checked');
    selectedFinish = defaultFinishOption?.value || null;

    // Get default frame
    const defaultFrameOption = document.querySelector('.frame-toggle input:checked');
    selectedFrame = defaultFrameOption?.value || 'none';

    updateVariant();
  }

  // Size selection handler
  sizeOptions.forEach(option => {
    option.addEventListener('click', function() {
      sizeOptions.forEach(opt => opt.classList.remove('selected'));
      this.classList.add('selected');
      
      const radio = this.querySelector('input[type="radio"]');
      if (radio) {
        radio.checked = true;
        selectedSize = radio.value;
      }
      
      updateVariant();
    });
  });

  // Finish selection handler
  finishOptions.forEach(option => {
    option.addEventListener('click', function() {
      finishOptions.forEach(opt => opt.classList.remove('selected'));
      this.classList.add('selected');
      
      const radio = this.querySelector('input[type="radio"]');
      if (radio) {
        radio.checked = true;
        selectedFinish = radio.value;
      }
      
      updateVariant();
    });
  });

  // Frame selection handler
  frameToggles.forEach(toggle => {
    toggle.addEventListener('click', function() {
      frameToggles.forEach(t => t.classList.remove('selected'));
      this.classList.add('selected');
      
      const radio = this.querySelector('input[type="radio"]');
      if (radio) {
        radio.checked = true;
        selectedFrame = radio.value;
      }
      
      updatePrice();
    });
  });

  // Update variant based on selections
  function updateVariant() {
    if (!selectedSize || !selectedFinish) return;

    // Find matching variant
    const matchingVariant = variants.find(variant => {
      const options = variant.options || [];
      const title = variant.title || '';
      
      // Check if variant matches selected size and finish
      const matchesSize = options.includes(selectedSize) || title.includes(selectedSize);
      const matchesFinish = options.includes(selectedFinish) || title.includes(selectedFinish);
      
      return matchesSize && matchesFinish;
    });

    if (matchingVariant) {
      // Update hidden input for cart
      if (variantIdInput) {
        variantIdInput.value = matchingVariant.id;
      }

      // Update price display
      updatePriceDisplay(matchingVariant.price);

      // Update availability
      updateAvailability(matchingVariant.available);

      // Switch to variant's image if available
      const imageIndex = variantImageMap.get(String(matchingVariant.id));
      if (imageIndex !== undefined) {
        showImage(imageIndex);
      }

      console.log('Variant selected:', matchingVariant);
    } else {
      console.warn('No matching variant found for:', { selectedSize, selectedFinish });
    }
  }

  // Update price display
  function updatePriceDisplay(basePrice) {
    if (!priceDisplay) return;

    // Frame pricing
    const framePrices = {
      'none': 0,
      'black': 2900, // $29.00 in cents
      'white': 2900
    };

    const framePrice = framePrices[selectedFrame] || 0;
    const totalPrice = basePrice + framePrice;

    // Format price (Shopify uses cents)
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(totalPrice / 100);

    priceDisplay.textContent = formatted;
  }

  // Update frame price
  function updatePrice() {
    // Get current variant to recalculate total
    const matchingVariant = variants.find(variant => {
      const options = variant.options || [];
      const title = variant.title || '';
      const matchesSize = options.includes(selectedSize) || title.includes(selectedSize);
      const matchesFinish = options.includes(selectedFinish) || title.includes(selectedFinish);
      return matchesSize && matchesFinish;
    });

    if (matchingVariant) {
      updatePriceDisplay(matchingVariant.price);
    }
  }

  // Update availability
  function updateAvailability(available) {
    if (!addToCartButton) return;

    if (available) {
      addToCartButton.disabled = false;
      addToCartButton.textContent = 'Add to Cart';
      addToCartButton.classList.remove('sold-out');
    } else {
      addToCartButton.disabled = true;
      addToCartButton.textContent = 'Sold Out';
      addToCartButton.classList.add('sold-out');
    }
  }

  // Initialize on page load
  if (variants.length > 0) {
    initializeSelections();
  }

  // Set initial selected states for option cards
  const firstSizeOption = document.querySelector('[data-option-type="size"]');
  const firstFinishOption = document.querySelector('[data-option-type="finish"]');
  const firstFrameOption = document.getElementById('no-frame-option');
  
  firstSizeOption?.classList.add('selected');
  firstFinishOption?.classList.add('selected');
  firstFrameOption?.classList.add('selected');
});
