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

  // Create persistent frame overlay element on page load
  let frameOverlay = null;
  function initFrameOverlay() {
    const mainWrapper = document.querySelector('.gallery__main-wrapper');
    if (!mainWrapper) return;

    frameOverlay = document.createElement('div');
    frameOverlay.className = 'frame-overlay';
    frameOverlay.dataset.frameType = 'none';
    mainWrapper.appendChild(frameOverlay);
  }

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

  // Frame overlay system - toggles classes instead of DOM recreation
  function updateFrameOverlay(frameType) {
    if (!frameOverlay) return;

    // Update frame type data attribute and classes
    frameOverlay.dataset.frameType = frameType;
    
    // Toggle visibility
    if (frameType === 'none') {
      frameOverlay.classList.remove('active');
    } else {
      frameOverlay.classList.add('active');
    }
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
  initFrameOverlay();
  
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

// ===== HERO MOCKUP SYSTEM (Displate-style) =====
document.addEventListener('DOMContentLoaded', function() {
  // Mockup template definitions
  // TODO: Replace with Shopify metafield data when available
  // CUSTOM MOCKUP IMAGES - AI-generated room scenes designed for consistent overlay placement
  // These images have fixed dimensions and no dynamic cropping, ensuring overlay stays locked
  // Images are hosted on Shopify CDN for reliable delivery
  const MOCKUP_TEMPLATES = [
    {
      id: 'living-room-modern',
      name: 'Modern Living Room',
      desktop_url: 'https://cdn.shopify.com/s/files/1/0874/1464/5721/files/mockup-living-room.png',
      mobile_url: 'https://cdn.shopify.com/s/files/1/0874/1464/5721/files/mockup-living-room.png',
      overlay_x: '50%',  // Centered on clear wall space
      overlay_y: '35%',  // Upper-center wall area
      overlay_x_mobile: '50%',  // Same position on mobile
      overlay_y_mobile: '35%',  // Same position on mobile
      base_width: '420px',
      base_width_mobile: '300px'
    },
    {
      id: 'bedroom-cozy',
      name: 'Cozy Bedroom',
      desktop_url: 'https://cdn.shopify.com/s/files/1/0874/1464/5721/files/mockup-bedroom.png',
      mobile_url: 'https://cdn.shopify.com/s/files/1/0874/1464/5721/files/mockup-bedroom.png',
      overlay_x: '50%',  // Centered above bed
      overlay_y: '30%',  // Above headboard area
      overlay_x_mobile: '50%',  // Same position on mobile
      overlay_y_mobile: '30%',  // Same position on mobile
      base_width: '400px',
      base_width_mobile: '280px'
    },
    {
      id: 'office-minimalist',
      name: 'Minimalist Office',
      desktop_url: 'https://cdn.shopify.com/s/files/1/0874/1464/5721/files/mockup-office.png',
      mobile_url: 'https://cdn.shopify.com/s/files/1/0874/1464/5721/files/mockup-office.png',
      overlay_x: '50%',  // Centered on clean wall
      overlay_y: '33%',  // Eye level placement
      overlay_x_mobile: '50%',  // Same position on mobile
      overlay_y_mobile: '33%',  // Same position on mobile
      base_width: '400px',
      base_width_mobile: '280px'
    },
    {
      id: 'gallery-wall',
      name: 'Gallery Wall',
      desktop_url: 'https://cdn.shopify.com/s/files/1/0874/1464/5721/files/mockup-gallery.png',
      mobile_url: 'https://cdn.shopify.com/s/files/1/0874/1464/5721/files/mockup-gallery.png',
      overlay_x: '50%',  // Perfectly centered
      overlay_y: '40%',  // Gallery center placement
      overlay_x_mobile: '50%',  // Same position on mobile
      overlay_y_mobile: '40%',  // Same position on mobile
      base_width: '400px',
      base_width_mobile: '280px'
    }
  ];

  // Size variant scale factors
  const SIZE_SCALE_FACTORS = {
    '8x10': 0.60,
    '10x10': 0.75,
    '12x16': 1.00,  // Base reference
    '16x16': 1.20,
    '18x24': 1.50,
    '24x36': 2.00
  };

  // DOM elements
  const heroSection = document.getElementById('hero-mockup-section');
  const heroContainer = document.getElementById('hero-mockup-container');
  const heroBackground = document.getElementById('hero-mockup-background');
  const heroOverlay = document.getElementById('hero-mockup-overlay');
  const heroArtwork = document.getElementById('hero-mockup-artwork');
  const heroFrame = document.getElementById('hero-mockup-frame');
  const mockupDots = document.getElementById('mockup-dots');
  const mockupPrev = document.getElementById('mockup-prev');
  const mockupNext = document.getElementById('mockup-next');

  // Skip if hero section doesn't exist
  if (!heroSection || MOCKUP_TEMPLATES.length === 0) {
    return;
  }

  // State management
  let currentMockupIndex = 0;
  let currentSizeScale = 1.0;
  let currentFrame = 'none';
  let currentArtworkRatio = 1.0;

  // Calculate artwork aspect ratio
  if (heroArtwork && heroArtwork.naturalWidth && heroArtwork.naturalHeight) {
    currentArtworkRatio = heroArtwork.naturalWidth / heroArtwork.naturalHeight;
  }

  // Initialize mockup system
  function initializeMockupSystem() {
    // Show hero section since we have mockups
    heroSection.setAttribute('data-has-mockups', 'true');
    heroSection.setAttribute('data-loading', 'false');

    // Create room selector dots
    createMockupDots();

    // Load first mockup
    loadMockup(0);

    // Set up event listeners
    setupMockupControls();
    setupConfiguratorSync();

    // Get initial size/frame from configurator
    syncInitialState();
  }

  // Create room selector dots
  function createMockupDots() {
    mockupDots.innerHTML = '';
    MOCKUP_TEMPLATES.forEach((template, index) => {
      const dot = document.createElement('button');
      dot.className = 'mockup-dot';
      dot.setAttribute('aria-label', `View ${template.name}`);
      dot.setAttribute('data-mockup-index', index);
      if (index === 0) dot.classList.add('active');
      mockupDots.appendChild(dot);
    });
  }

  // Load mockup template
  function loadMockup(index) {
    if (index < 0 || index >= MOCKUP_TEMPLATES.length) return;

    const template = MOCKUP_TEMPLATES[index];
    currentMockupIndex = index;

    // Determine which URL to use based on viewport
    const isMobile = window.innerWidth <= 768;
    const mockupUrl = isMobile ? template.mobile_url : template.desktop_url;

    // Update background image using <img> tag instead of CSS background
    let bgImg = heroBackground.querySelector('img');
    if (!bgImg) {
      bgImg = document.createElement('img');
      bgImg.alt = template.name;
      heroBackground.appendChild(bgImg);
    }
    bgImg.src = mockupUrl;

    // Update overlay positioning via CSS custom properties
    heroContainer.style.setProperty('--overlay-x', template.overlay_x);
    heroContainer.style.setProperty('--overlay-y', template.overlay_y);
    heroContainer.style.setProperty('--overlay-x-mobile', template.overlay_x_mobile);
    heroContainer.style.setProperty('--overlay-y-mobile', template.overlay_y_mobile);
    heroContainer.style.setProperty('--base-width', template.base_width);
    heroContainer.style.setProperty('--base-width-mobile', template.base_width_mobile);
    heroContainer.style.setProperty('--artwork-ratio', currentArtworkRatio);
    heroContainer.style.setProperty('--size-scale', currentSizeScale);

    // Update dot indicators
    document.querySelectorAll('.mockup-dot').forEach((dot, i) => {
      dot.classList.toggle('active', i === index);
    });

    // Update navigation button states
    mockupPrev.disabled = index === 0;
    mockupNext.disabled = index === MOCKUP_TEMPLATES.length - 1;
  }

  // Setup mockup navigation controls
  function setupMockupControls() {
    // Previous button
    mockupPrev.addEventListener('click', () => {
      if (currentMockupIndex > 0) {
        loadMockup(currentMockupIndex - 1);
      }
    });

    // Next button
    mockupNext.addEventListener('click', () => {
      if (currentMockupIndex < MOCKUP_TEMPLATES.length - 1) {
        loadMockup(currentMockupIndex + 1);
      }
    });

    // Dot navigation
    mockupDots.addEventListener('click', (e) => {
      if (e.target.classList.contains('mockup-dot')) {
        const index = parseInt(e.target.getAttribute('data-mockup-index'));
        loadMockup(index);
      }
    });

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' && currentMockupIndex > 0) {
        loadMockup(currentMockupIndex - 1);
      } else if (e.key === 'ArrowRight' && currentMockupIndex < MOCKUP_TEMPLATES.length - 1) {
        loadMockup(currentMockupIndex + 1);
      }
    });

    // Responsive mockup switching on resize
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        loadMockup(currentMockupIndex); // Reload with appropriate mobile/desktop image
      }, 250);
    });
  }

  // Setup synchronization with configurator
  function setupConfiguratorSync() {
    // Listen for size changes from configurator
    document.addEventListener('size-changed', (e) => {
      updateMockupSize(e.detail.size);
    });

    // Listen for frame changes from configurator
    document.addEventListener('frame-changed', (e) => {
      updateMockupFrame(e.detail.frame);
    });

    // Also listen to DOM changes for size selection
    const sizeOptions = document.querySelectorAll('[data-option-type="size"] input[type="radio"]');
    sizeOptions.forEach(radio => {
      radio.addEventListener('change', function() {
        updateMockupSize(this.value);
      });
    });

    // Listen for frame toggle changes
    const frameToggles = document.querySelectorAll('.frame-toggle input[type="radio"]');
    frameToggles.forEach(radio => {
      radio.addEventListener('change', function() {
        updateMockupFrame(this.value);
      });
    });
  }

  // Sync initial state from configurator
  function syncInitialState() {
    // Get selected size
    const selectedSizeRadio = document.querySelector('[data-option-type="size"] input[type="radio"]:checked');
    if (selectedSizeRadio) {
      updateMockupSize(selectedSizeRadio.value);
    }

    // Get selected frame
    const selectedFrameRadio = document.querySelector('.frame-toggle input[type="radio"]:checked');
    if (selectedFrameRadio) {
      updateMockupFrame(selectedFrameRadio.value);
    }
  }

  // Update mockup size based on variant selection
  function updateMockupSize(sizeValue) {
    // Extract size from variant name (e.g., "8x10 - Canvas" -> "8x10")
    const sizeMatch = sizeValue.match(/(\d+x\d+)/);
    if (!sizeMatch) return;

    const size = sizeMatch[1];
    const scaleFactor = SIZE_SCALE_FACTORS[size] || 1.0;

    currentSizeScale = scaleFactor;
    heroContainer.style.setProperty('--size-scale', scaleFactor);
  }

  // Update mockup frame based on frame selection
  function updateMockupFrame(frameValue) {
    currentFrame = frameValue;
    heroFrame.setAttribute('data-frame', frameValue);

    // TODO: Load actual frame PNG assets when available
    // For now, CSS handles frame styling via data-frame attribute
  }

  // Initialize the system
  initializeMockupSystem();
});
