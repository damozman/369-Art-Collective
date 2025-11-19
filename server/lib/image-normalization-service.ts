/**
 * Image Normalization Service
 * Handles automatic image resizing to ensure images fit within safe processing bounds
 * - Auto-downscales oversized images (>12M pixels)
 * - Validates minimum size requirements (1800px shortest side)
 * - Provides helpful customer-facing messages
 */

import sharp from 'sharp';

// Processing limits
const MAX_SAFE_PIXELS = 12_000_000; // 12M pixels (~3464×3464)
const MIN_SHORTEST_SIDE = 1800; // Minimum 1800px on shortest dimension

export enum ImageOrientation {
  PORTRAIT = 'portrait',   // Taller than wide (best for wall art)
  LANDSCAPE = 'landscape', // Wider than tall (limited variants)
  SQUARE = 'square'        // Equal dimensions
}

export interface NormalizationResult {
  wasModified: boolean;
  originalWidth: number;
  originalHeight: number;
  normalizedWidth: number;
  normalizedHeight: number;
  buffer: Buffer;
  orientation: ImageOrientation;
  customerMessage?: string;
  reason?: 'downscaled' | 'accepted' | 'rejected';
}

export class ImageNormalizationService {
  
  /**
   * Detect image orientation based on aspect ratio
   */
  static detectOrientation(width: number, height: number): ImageOrientation {
    const ratio = width / height;
    
    if (Math.abs(ratio - 1) < 0.1) {
      return ImageOrientation.SQUARE; // Within 10% of 1:1
    } else if (width > height) {
      return ImageOrientation.LANDSCAPE;
    } else {
      return ImageOrientation.PORTRAIT;
    }
  }

  /**
   * Calculate if image needs downscaling
   */
  static needsDownscaling(width: number, height: number): boolean {
    return (width * height) > MAX_SAFE_PIXELS;
  }

  /**
   * Calculate if image is too small
   */
  static isTooSmall(width: number, height: number): boolean {
    return Math.min(width, height) < MIN_SHORTEST_SIDE;
  }

  /**
   * Calculate optimal dimensions for downscaling
   * Maintains aspect ratio while fitting within MAX_SAFE_PIXELS
   */
  static calculateNormalizedDimensions(width: number, height: number): { width: number; height: number } {
    const currentPixels = width * height;
    
    if (currentPixels <= MAX_SAFE_PIXELS) {
      return { width, height };
    }

    // Calculate scale factor to fit within limit
    const scaleFactor = Math.sqrt(MAX_SAFE_PIXELS / currentPixels);
    
    return {
      width: Math.floor(width * scaleFactor),
      height: Math.floor(height * scaleFactor)
    };
  }

  /**
   * Generate customer-friendly message based on normalization action
   */
  static generateCustomerMessage(
    wasModified: boolean,
    reason: 'downscaled' | 'accepted' | 'rejected',
    orientation: ImageOrientation,
    originalWidth: number,
    originalHeight: number,
    normalizedWidth?: number,
    normalizedHeight?: number
  ): string {
    if (reason === 'rejected') {
      const minSize = orientation === ImageOrientation.PORTRAIT 
        ? `${MIN_SHORTEST_SIDE}×${Math.floor(MIN_SHORTEST_SIDE * 1.33)}`
        : orientation === ImageOrientation.LANDSCAPE
        ? `${Math.floor(MIN_SHORTEST_SIDE * 1.33)}×${MIN_SHORTEST_SIDE}`
        : `${MIN_SHORTEST_SIDE}×${MIN_SHORTEST_SIDE}`;
      
      return `Image too small (${originalWidth}×${originalHeight}px). Please upload a higher-resolution image of at least ${minSize}px to ensure print quality.`;
    }

    if (reason === 'downscaled') {
      return `✓ Large image automatically optimized from ${originalWidth}×${originalHeight}px to ${normalizedWidth}×${normalizedHeight}px for processing. Print quality preserved.`;
    }

    // Accepted as-is
    const orientationNote = 
      orientation === ImageOrientation.PORTRAIT 
        ? ' Perfect for wall art prints!'
        : orientation === ImageOrientation.LANDSCAPE
        ? ' Great for panoramic prints.'
        : ' Ideal for square prints.';

    return `✓ Image accepted (${originalWidth}×${originalHeight}px).${orientationNote}`;
  }

  /**
   * Normalize an image buffer
   * - Downscales if too large
   * - Rejects if too small
   * - Returns normalized buffer with metadata
   */
  static async normalizeImage(buffer: Buffer): Promise<NormalizationResult> {
    // Get original dimensions
    const metadata = await sharp(buffer).metadata();
    const originalWidth = metadata.width!;
    const originalHeight = metadata.height!;
    const orientation = this.detectOrientation(originalWidth, originalHeight);

    // Check if too small (reject)
    if (this.isTooSmall(originalWidth, originalHeight)) {
      return {
        wasModified: false,
        originalWidth,
        originalHeight,
        normalizedWidth: originalWidth,
        normalizedHeight: originalHeight,
        buffer,
        orientation,
        reason: 'rejected',
        customerMessage: this.generateCustomerMessage(
          false,
          'rejected',
          orientation,
          originalWidth,
          originalHeight
        )
      };
    }

    // Check if needs downscaling
    if (this.needsDownscaling(originalWidth, originalHeight)) {
      const { width: normalizedWidth, height: normalizedHeight } = 
        this.calculateNormalizedDimensions(originalWidth, originalHeight);

      // Downscale image
      const normalizedBuffer = await sharp(buffer)
        .resize(normalizedWidth, normalizedHeight, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .toBuffer();

      console.log(`[IMAGE_NORMALIZATION] Downscaled ${originalWidth}×${originalHeight}px → ${normalizedWidth}×${normalizedHeight}px`);

      return {
        wasModified: true,
        originalWidth,
        originalHeight,
        normalizedWidth,
        normalizedHeight,
        buffer: normalizedBuffer,
        orientation,
        reason: 'downscaled',
        customerMessage: this.generateCustomerMessage(
          true,
          'downscaled',
          orientation,
          originalWidth,
          originalHeight,
          normalizedWidth,
          normalizedHeight
        )
      };
    }

    // Image is good as-is
    return {
      wasModified: false,
      originalWidth,
      originalHeight,
      normalizedWidth: originalWidth,
      normalizedHeight: originalHeight,
      buffer,
      orientation,
      reason: 'accepted',
      customerMessage: this.generateCustomerMessage(
        false,
        'accepted',
        orientation,
        originalWidth,
        originalHeight
      )
    };
  }

  /**
   * Get maximum safe upscale factor based on current dimensions and orientation
   * Prevents GPU memory errors by limiting output size
   */
  static getMaxSafeUpscaleFactor(width: number, height: number, orientation: ImageOrientation): number {
    const MAX_OUTPUT_PIXELS = 32_000_000; // 32M pixels max output (~5656×5656)
    
    const currentPixels = width * height;
    
    // Calculate theoretical max scale
    const maxScale = Math.sqrt(MAX_OUTPUT_PIXELS / currentPixels);
    
    // Round down to nearest valid scale (2 or 4)
    // Also apply orientation-specific limits
    if (orientation === ImageOrientation.LANDSCAPE) {
      // Landscape images get massive outputs, cap at scale 2
      return Math.min(2, Math.floor(maxScale));
    } else if (orientation === ImageOrientation.SQUARE) {
      // Square can handle scale 3
      return Math.min(3, Math.floor(maxScale));
    } else {
      // Portrait can handle scale 4
      return Math.min(4, Math.floor(maxScale));
    }
  }
}
