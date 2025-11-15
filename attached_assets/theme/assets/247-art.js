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
  let selectedFrame = 'none';  // Derived from finish selection (Framed = black frame)

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
        
        // If "Framed" finish is selected, show frame overlay
        selectedFrame = (selectedFinish === 'Framed') ? 'black' : 'none';
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
      
      // Unified update: both price and visual preview
      updatePreview();
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

      // Update visual preview (size + frame)
      updatePreview();

      console.log('Variant selected:', matchingVariant);
    } else {
      console.warn('No matching variant found for:', { selectedSize, selectedFinish });
    }
  }

  // Frame overlay system removed - frames now controlled directly on mockup slides

  // Visual size preview - uses CSS custom property for dimension-aware scaling
  function updateSizePreview(size) {
    const mainGallery = document.querySelector('.gallery__main');
    if (!mainGallery) return;

    // Size scale mapping (relative visual representation)
    const sizeScales = {
      '8x10': 0.70,
      '11x14': 0.85,
      '16x20': 1.00,
      '18x24': 1.10,
      '24x36': 1.30,
      // Fallback patterns
      'M': 0.85,
      'L': 1.00,
      'XL': 1.15
    };

    const scale = sizeScales[size] || 1.00;
    
    // Apply scale via CSS custom property for layout-aware scaling
    mainGallery.style.setProperty('--preview-scale', scale);
  }

  // Update all mockup slide frames
  function updateFrameOverlay(frameType) {
    // Update all mockup slide frames
    const allFrames = document.querySelectorAll('.mockup-slide__frame');
    allFrames.forEach(frame => {
      frame.setAttribute('data-frame', frameType);
    });
    
    // Notify mockup system of frame change via custom event
    const event = new CustomEvent('frameChanged', { detail: { frameType } });
    document.dispatchEvent(event);
  }

  // Unified update function for all preview changes
  function updatePreview() {
    updateSizePreview(selectedSize);
    updateFrameOverlay(selectedFrame);
    updatePrice();
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
  
  // Initialize all mockup frames to 'none' on load
  const allFrames = document.querySelectorAll('.mockup-slide__frame');
  allFrames.forEach(frame => {
    frame.setAttribute('data-frame', 'none');
  });

  // Set initial selected states for option cards
  const firstSizeOption = document.querySelector('[data-option-type="size"]');
  const firstFinishOption = document.querySelector('[data-option-type="finish"]');
  const firstFrameOption = document.getElementById('no-frame-option');
  
  firstSizeOption?.classList.add('selected');
  firstFinishOption?.classList.add('selected');
  firstFrameOption?.classList.add('selected');
});

// Thumbnail scroll button functionality
document.addEventListener('DOMContentLoaded', function() {
  const thumbnailsContainer = document.querySelector('.gallery__thumbnails');
  const scrollUpBtn = document.querySelector('.gallery__scroll-btn--up');
  const scrollDownBtn = document.querySelector('.gallery__scroll-btn--down');
  
  if (!thumbnailsContainer || !scrollUpBtn || !scrollDownBtn) return;
  
  const scrollAmount = 90; // Scroll by one thumbnail height + gap
  
  scrollUpBtn.addEventListener('click', function() {
    thumbnailsContainer.scrollBy({ top: -scrollAmount, behavior: 'smooth' });
  });
  
  scrollDownBtn.addEventListener('click', function() {
    thumbnailsContainer.scrollBy({ top: scrollAmount, behavior: 'smooth' });
  });
  
  // Update button states based on scroll position
  function updateScrollButtons() {
    const atTop = thumbnailsContainer.scrollTop === 0;
    const atBottom = thumbnailsContainer.scrollTop + thumbnailsContainer.clientHeight >= thumbnailsContainer.scrollHeight - 1;
    
    scrollUpBtn.disabled = atTop;
    scrollDownBtn.disabled = atBottom;
  }
  
  thumbnailsContainer.addEventListener('scroll', updateScrollButtons);
  updateScrollButtons(); // Initial state
});

// ===== GALLERY MOCKUP SYSTEM =====
document.addEventListener('DOMContentLoaded', function() {
  // MOCKUP TEMPLATES - overlay positioning data for room mockup slides
  // Matches data-mockup-room values: 'living-room', 'bedroom', 'office', 'gallery'
  const MOCKUP_TEMPLATES = [
    {
      id: 'living-room',
      name: 'Modern Living Room',
      overlay_x: '50%',  // Centered horizontally
      overlay_y: '42%',  // Wall center
      overlay_x_mobile: '50%',
      overlay_y_mobile: '42%',
      base_width: '28%',  // Percentage of rendered image width
      base_width_mobile: '35%'
    },
    {
      id: 'bedroom',
      name: 'Cozy Bedroom',
      overlay_x: '50%',  // Centered horizontally
      overlay_y: '38%',  // Above bed
      overlay_x_mobile: '50%',
      overlay_y_mobile: '38%',
      base_width: '26%',
      base_width_mobile: '32%'
    },
    {
      id: 'office',
      name: 'Minimalist Office',
      overlay_x: '50%',  // Centered horizontally
      overlay_y: '40%',  // Wall center
      overlay_x_mobile: '50%',
      overlay_y_mobile: '40%',
      base_width: '26%',
      base_width_mobile: '32%'
    },
    {
      id: 'gallery',
      name: 'Gallery Wall',
      overlay_x: '50%',  // Centered horizontally
      overlay_y: '45%',  // Gallery center
      overlay_x_mobile: '50%',
      overlay_y_mobile: '45%',
      base_width: '26%',
      base_width_mobile: '32%'
    }
  ];

  // Size variant scale factors (based on diagonal proportions)
  const SIZE_SCALE_FACTORS = {
    '8x10': 0.64,   // 12.81" diagonal (smallest)
    '11x14': 0.88,  // 17.80" diagonal
    '12x16': 1.00,  // 20" diagonal - Base reference
    '16x20': 1.31,  // 25.61" diagonal
    '18x24': 1.50,  // 30" diagonal
    '24x36': 2.16   // 43.27" diagonal (largest)
  };

  // State management
  let currentSizeScale = 1.0;
  let currentFrame = 'none';

  // Calculate actual rendered image bounds (handles object-fit: contain letterboxing)
  function calculateImageBounds(img, container) {
    if (!img || !img.naturalWidth || !img.naturalHeight) {
      return null;
    }

    const containerWidth = container.offsetWidth;
    const containerHeight = container.offsetHeight;
    const imageAspect = img.naturalWidth / img.naturalHeight;
    const containerAspect = containerWidth / containerHeight;

    let renderedWidth, renderedHeight, offsetX, offsetY;

    if (imageAspect > containerAspect) {
      // Image is wider - fits to width, letterboxed top/bottom
      renderedWidth = containerWidth;
      renderedHeight = containerWidth / imageAspect;
      offsetX = 0;
      offsetY = (containerHeight - renderedHeight) / 2;
    } else {
      // Image is taller - fits to height, letterboxed left/right
      renderedHeight = containerHeight;
      renderedWidth = containerHeight * imageAspect;
      offsetX = (containerWidth - renderedWidth) / 2;
      offsetY = 0;
    }

    return {
      width: renderedWidth,
      height: renderedHeight,
      left: offsetX,
      top: offsetY
    };
  }

  // Detect and position overlay on active mockup slide
  function updateMockupOverlay() {
    // Find active mockup slide
    const activeSlide = document.querySelector('.gallery__main-image.active[data-mockup="true"]');
    
    if (!activeSlide) {
      // No mockup slide active, skip
      return;
    }

    const room = activeSlide.dataset.mockupRoom;
    const template = MOCKUP_TEMPLATES.find(t => t.id === room);
    
    if (!template) {
      console.warn('No template found for room:', room);
      return;
    }

    // Get mockup elements within the active slide
    const overlay = activeSlide.querySelector('.mockup-slide__overlay');
    const background = activeSlide.querySelector('.mockup-slide__background');
    const artwork = activeSlide.querySelector('.mockup-slide__artwork');
    const frame = activeSlide.querySelector('.mockup-slide__frame');
    
    if (!overlay || !background) {
      console.warn('Mockup slide elements not found');
      return;
    }

    // Wait for background image to load
    const bgImg = background.tagName === 'IMG' ? background : background.querySelector('img');
    if (!bgImg || !bgImg.complete) {
      // Image not loaded yet, wait for load event
      if (bgImg) {
        bgImg.addEventListener('load', updateMockupOverlay, { once: true });
      }
      return;
    }

    // Calculate actual rendered image bounds
    const slideContainer = activeSlide.closest('.gallery__main-wrapper') || activeSlide.parentElement;
    const bounds = calculateImageBounds(bgImg, slideContainer);
    
    if (!bounds) {
      console.warn('Could not calculate image bounds');
      return;
    }

    // Convert percentage positions to pixels based on actual image area
    const isMobile = window.innerWidth <= 768;
    const overlayXPercent = parseFloat(isMobile ? template.overlay_x_mobile : template.overlay_x) / 100;
    const overlayYPercent = parseFloat(isMobile ? template.overlay_y_mobile : template.overlay_y) / 100;

    // Calculate absolute pixel position
    const absoluteX = bounds.left + (bounds.width * overlayXPercent);
    const absoluteY = bounds.top + (bounds.height * overlayYPercent);

    // Calculate base overlay width (before size scaling)
    const baseWidthPercent = parseFloat(isMobile ? template.base_width_mobile : template.base_width) / 100;
    const baseOverlayWidthPx = bounds.width * baseWidthPercent;

    console.log('Positioning mockup overlay:', {
      room: room,
      template: template.name,
      bounds: bounds,
      overlayXPercent,
      overlayYPercent,
      absoluteX,
      absoluteY,
      baseOverlayWidthPx,
      sizeScale: currentSizeScale
    });

    // Apply positioning and size
    overlay.style.left = `${absoluteX}px`;
    overlay.style.top = `${absoluteY}px`;
    overlay.style.width = `${baseOverlayWidthPx}px`;
    
    // Apply size scale via CSS variable for smooth GPU-accelerated scaling
    overlay.style.setProperty('--size-scale', currentSizeScale);

    // Update frame visibility via data attribute (CSS handles opacity)
    if (frame) {
      frame.setAttribute('data-frame', currentFrame);
    }
  }

  // Update mockup size based on variant selection
  function updateMockupSize(sizeValue) {
    console.log('updateMockupSize called with:', sizeValue);
    
    // Extract size from variant name (e.g., "8x10 - Canvas" -> "8x10")
    const sizeMatch = sizeValue?.match(/(\d+x\d+)/);
    if (!sizeMatch) {
      console.warn('No size match found for:', sizeValue);
      return;
    }

    const size = sizeMatch[1];
    const scaleFactor = SIZE_SCALE_FACTORS[size] || 1.0;

    console.log('Applying size scale:', size, '→', scaleFactor);
    currentSizeScale = scaleFactor;
    
    // Reposition overlay with new scale
    updateMockupOverlay();
  }

  // Update mockup frame based on frame selection
  function updateMockupFrame(frameValue) {
    currentFrame = frameValue;
    
    // Update overlay with new frame
    updateMockupOverlay();
  }

  // Listen for size changes from variant configurator
  // Listen on the parent containers that have data-option-type="size"
  const sizeOptionContainers = document.querySelectorAll('[data-option-type="size"]');
  sizeOptionContainers.forEach(container => {
    container.addEventListener('click', function() {
      const radio = this.querySelector('input[type="radio"]');
      if (radio) {
        updateMockupSize(radio.value);
      }
    });
  });
  
  // Also listen for direct radio button changes (fallback)
  const sizeRadios = document.querySelectorAll('input[name="size"]');
  sizeRadios.forEach(radio => {
    radio.addEventListener('change', function() {
      updateMockupSize(this.value);
    });
  });

  // Listen for frame toggle changes from configurator
  document.addEventListener('frameChanged', function(event) {
    const frameType = event.detail.frameType;
    currentFrame = frameType;
    // Reposition overlay to apply frame change to active mockup
    updateMockupOverlay();
  });
  
  // Also listen to direct radio button changes (fallback)
  const frameToggles = document.querySelectorAll('.frame-toggle input[type="radio"]');
  frameToggles.forEach(radio => {
    radio.addEventListener('change', function() {
      updateMockupFrame(this.value);
    });
  });

  // Listen for gallery slide changes (detect via MutationObserver or existing showImage function)
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        // Class changed on gallery image - check if it became active
        const target = mutation.target;
        if (target.classList.contains('active') && target.dataset.mockup === 'true') {
          updateMockupOverlay();
        }
      }
    });
  });

  // Observe all gallery main images for class changes
  const mainImages = document.querySelectorAll('.gallery__main-image');
  mainImages.forEach(img => {
    observer.observe(img, { attributes: true, attributeFilter: ['class'] });
  });

  // Window resize handler
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      updateMockupOverlay();
    }, 100);
  });

  // Initial state sync - default to 8x10 (smallest size) if no size selected
  const selectedSizeRadio = document.querySelector('[data-option-type="size"] input[type="radio"]:checked');
  if (selectedSizeRadio) {
    updateMockupSize(selectedSizeRadio.value);
  } else {
    // Default to 8x10 (smallest size) for initial display
    currentSizeScale = SIZE_SCALE_FACTORS['8x10'] || 0.64;
  }

  const selectedFrameRadio = document.querySelector('.frame-toggle input[type="radio"]:checked');
  if (selectedFrameRadio) {
    updateMockupFrame(selectedFrameRadio.value);
  }

  // Initial overlay positioning
  updateMockupOverlay();
});
