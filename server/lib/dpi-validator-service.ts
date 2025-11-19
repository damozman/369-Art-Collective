import { ReplicateUpscaleService } from './replicate-upscale-service';

export interface ProductVariantQualification {
  variantKey: string;
  productName: string;
  widthInches: number;
  heightInches: number;
  qualified: boolean;
  requiredPixels: { width: number; height: number };
}

export type ImageOrientation = 'portrait' | 'landscape' | 'square';
export type QualityLevel = 'excellent' | 'good' | 'needs-boost' | 'rejected';

export interface ImageQualityAnalysis {
  width: number;
  height: number;
  megapixels: number;
  estimatedDpi: number;
  targetDpi: number;
  meetsMinimum: boolean;
  meetsTarget: boolean;
  recommendation: 'perfect' | 'good' | 'needs_upscaling' | 'unsuitable';
  message: string;
  productSuitability: {
    poster: boolean;
    canvas: boolean;
    framedPrint: boolean;
    metalSign: boolean;
  };
  variantQualification: {
    qualified: ProductVariantQualification[];
    locked: ProductVariantQualification[];
    totalQualified: number;
    totalVariants: number;
  };
  orientation?: ImageOrientation;
  qualityLevel?: QualityLevel;
  customerGuidance?: string;
}

export class DpiValidatorService {
  
  static readonly MIN_DPI = 150;
  static readonly TARGET_DPI = 300;
  
  static readonly PRODUCT_SIZES = {
    poster: { width: 18, height: 24 },
    canvas: { width: 16, height: 20 },
    framedPrint: { width: 18, height: 24 },
    metalSign: { width: 12, height: 16 },
  };

  static readonly PRODUCT_VARIANTS = [
    { key: 'poster_small', name: 'Poster 11×8"', width: 11, height: 8 },
    { key: 'poster_medium', name: 'Poster 18×24"', width: 18, height: 24 },
    { key: 'poster_large', name: 'Poster 24×36"', width: 24, height: 36 },
    { key: 'canvas_small', name: 'Canvas 12×9"', width: 12, height: 9 },
    { key: 'canvas_medium', name: 'Canvas 16×20"', width: 16, height: 20 },
    { key: 'canvas_large', name: 'Canvas 24×32"', width: 24, height: 32 },
    { key: 'framed_small', name: 'Framed 12×16"', width: 12, height: 16 },
    { key: 'framed_medium', name: 'Framed 18×24"', width: 18, height: 24 },
    { key: 'framed_large', name: 'Framed 24×36"', width: 24, height: 36 },
    { key: 'metal_small', name: 'Metal 12×16"', width: 12, height: 16 },
    { key: 'metal_medium', name: 'Metal 18×24"', width: 18, height: 24 },
    { key: 'metal_large', name: 'Metal 24×36"', width: 24, height: 36 },
  ];

  static analyzePrintQuality(width: number, height: number): ImageQualityAnalysis {
    const megapixels = (width * height) / 1_000_000;
    
    const shortSide = Math.min(width, height);
    const longSide = Math.max(width, height);
    
    const largestDimension = Math.max(width, height);
    const largestProductDimension = Math.max(
      this.PRODUCT_SIZES.poster.width,
      this.PRODUCT_SIZES.poster.height
    );
    
    const estimatedDpi = Math.floor(largestDimension / largestProductDimension);
    
    const meetsMinimum = estimatedDpi >= this.MIN_DPI;
    const meetsTarget = estimatedDpi >= this.TARGET_DPI;
    
    const qualified: ProductVariantQualification[] = [];
    const locked: ProductVariantQualification[] = [];
    
    for (const variant of this.PRODUCT_VARIANTS) {
      const requiredShortSide = Math.min(variant.width, variant.height) * this.MIN_DPI;
      const requiredLongSide = Math.max(variant.width, variant.height) * this.MIN_DPI;
      
      const meetsRequirements = shortSide >= requiredShortSide && longSide >= requiredLongSide;
      
      const qualification: ProductVariantQualification = {
        variantKey: variant.key,
        productName: variant.name,
        widthInches: variant.width,
        heightInches: variant.height,
        qualified: meetsRequirements,
        requiredPixels: {
          width: variant.width * this.MIN_DPI,
          height: variant.height * this.MIN_DPI,
        },
      };
      
      if (meetsRequirements) {
        qualified.push(qualification);
      } else {
        locked.push(qualification);
      }
    }
    
    let recommendation: 'perfect' | 'good' | 'needs_upscaling' | 'unsuitable';
    let message: string;
    
    if (estimatedDpi >= this.TARGET_DPI) {
      recommendation = 'perfect';
      message = `Excellent quality! Your image qualifies for all ${this.PRODUCT_VARIANTS.length} product variants at ${estimatedDpi} DPI.`;
    } else if (estimatedDpi >= 200) {
      recommendation = 'good';
      message = `Good quality at ~${estimatedDpi} DPI. Qualifies for ${qualified.length}/${this.PRODUCT_VARIANTS.length} variants. Upscaling could unlock larger sizes.`;
    } else if (qualified.length >= 8) {
      recommendation = 'needs_upscaling';
      message = `Your image qualifies for ${qualified.length}/${this.PRODUCT_VARIANTS.length} variants at ~${estimatedDpi} DPI. Upscaling recommended to unlock larger sizes.`;
    } else if (qualified.length > 0) {
      recommendation = 'unsuitable';
      message = `Limited quality: only ${qualified.length}/${this.PRODUCT_VARIANTS.length} variants qualify. Please upload a higher resolution image (minimum 2700×3600 pixels for 8+ variants).`;
    } else {
      recommendation = 'unsuitable';
      message = `Image resolution too low. No variants qualify. Minimum 2700×3600 pixels required.`;
    }
    
    const productSuitability = {
      poster: estimatedDpi >= this.MIN_DPI,
      canvas: estimatedDpi >= this.MIN_DPI,
      framedPrint: estimatedDpi >= this.MIN_DPI,
      metalSign: estimatedDpi >= 180,
    };
    
    // Add new features: orientation, quality level, customer guidance
    const orientation = this.detectOrientation(width, height);
    const qualityLevel = this.determineQualityLevel(estimatedDpi, qualified.length, this.PRODUCT_VARIANTS.length);
    const customerGuidance = this.generateCustomerGuidance(
      qualityLevel,
      orientation,
      width,
      height,
      qualified.length,
      this.PRODUCT_VARIANTS.length,
      estimatedDpi
    );
    
    return {
      width,
      height,
      megapixels: parseFloat(megapixels.toFixed(2)),
      estimatedDpi,
      targetDpi: this.TARGET_DPI,
      meetsMinimum: qualified.length >= 8,
      meetsTarget: qualified.length === this.PRODUCT_VARIANTS.length,
      recommendation,
      message,
      productSuitability,
      variantQualification: {
        qualified,
        locked,
        totalQualified: qualified.length,
        totalVariants: this.PRODUCT_VARIANTS.length,
      },
      orientation,
      qualityLevel,
      customerGuidance,
    };
  }

  static calculateUpscaledQuality(
    originalWidth: number,
    originalHeight: number,
    scale: number = 4
  ): ImageQualityAnalysis {
    const upscaledWidth = originalWidth * scale;
    const upscaledHeight = originalHeight * scale;
    
    return this.analyzePrintQuality(upscaledWidth, upscaledHeight);
  }

  static shouldRecommendUpscaling(width: number, height: number): boolean {
    const analysis = this.analyzePrintQuality(width, height);
    
    // First check if upscaling is even safe/possible
    const scale = this.getUpscaleScale(width, height);
    if (scale === null) {
      // Image is too large to upscale safely
      return false;
    }
    
    // Case 1: Already meets minimum but could be better
    if (analysis.recommendation === 'needs_upscaling' || analysis.recommendation === 'good') {
      return true;
    }
    
    // Case 2: Below minimum BUT upscaling would help reach it
    if (analysis.variantQualification.totalQualified < 8) {
      // Check if upscaling would help
      const upscaledAnalysis = this.calculateUpscaledQuality(width, height, scale);
      
      // Recommend upscaling if it would bring us to 8+ variants
      return upscaledAnalysis.variantQualification.totalQualified >= 8;
    }
    
    return false;
  }

  static getUpscaleScale(width: number, height: number): 2 | 3 | 4 | null {
    // Use ReplicateUpscaleService's orientation-aware calculation
    // which considers GPU memory limits and orientation-specific constraints
    return ReplicateUpscaleService.calculateOptimalScale(width, height);
  }

  static isAcceptableForPrint(width: number, height: number): boolean {
    const analysis = this.analyzePrintQuality(width, height);
    return analysis.variantQualification.totalQualified >= 8;
  }
  
  static getQualifiedVariantKeys(width: number, height: number): string[] {
    const analysis = this.analyzePrintQuality(width, height);
    return analysis.variantQualification.qualified.map(v => v.variantKey);
  }
  
  static getVariantDimensions(variantKey: string): { width: number; height: number } | null {
    const variant = this.PRODUCT_VARIANTS.find(v => v.key === variantKey);
    return variant ? { width: variant.width, height: variant.height } : null;
  }
  
  static getAllVariantDimensions(): Map<string, { width: number; height: number }> {
    const map = new Map();
    for (const variant of this.PRODUCT_VARIANTS) {
      map.set(variant.key, { width: variant.width, height: variant.height });
    }
    return map;
  }

  /**
   * Detect image orientation based on aspect ratio
   */
  static detectOrientation(width: number, height: number): ImageOrientation {
    const ratio = width / height;
    
    if (Math.abs(ratio - 1) < 0.1) {
      return 'square'; // Within 10% of 1:1
    } else if (width > height) {
      return 'landscape';
    } else {
      return 'portrait';
    }
  }

  /**
   * Determine quality level with traffic light system
   * excellent (green) = 300+ DPI or all variants qualified
   * good (yellow) = 150-300 DPI or 8+ variants
   * needs-boost (orange) = Can be improved with upscaling
   * rejected (red) = Below minimum standards
   */
  static determineQualityLevel(
    estimatedDpi: number,
    totalQualified: number,
    totalVariants: number
  ): QualityLevel {
    // Excellent: Professional quality
    if (estimatedDpi >= this.TARGET_DPI || totalQualified === totalVariants) {
      return 'excellent';
    }
    
    // Good: Acceptable quality
    if (estimatedDpi >= this.MIN_DPI && totalQualified >= 8) {
      return 'good';
    }
    
    // Needs boost: Can be improved
    if (totalQualified >= 4 && totalQualified < 8) {
      return 'needs-boost';
    }
    
    // Rejected: Too low quality
    return 'rejected';
  }

  /**
   * Generate customer-friendly guidance based on quality level and orientation
   */
  static generateCustomerGuidance(
    qualityLevel: QualityLevel,
    orientation: ImageOrientation,
    width: number,
    height: number,
    totalQualified: number,
    totalVariants: number,
    estimatedDpi: number
  ): string {
    // Check if upscaling is actually possible for this image
    const canUpscale = this.getUpscaleScale(width, height) !== null;
    
    const orientationNote = 
      orientation === 'portrait' 
        ? ' Portrait orientation is perfect for wall art!' 
        : orientation === 'landscape'
        ? ' Landscape images work best for panoramic prints.'
        : ' Square images are ideal for balanced compositions.';

    switch (qualityLevel) {
      case 'excellent':
        return `Excellent! Professional print quality at ${estimatedDpi} DPI. Qualifies for all ${totalVariants} product sizes.${orientationNote}`;
      
      case 'good':
        if (canUpscale) {
          return `Good quality at ${estimatedDpi} DPI. Qualifies for ${totalQualified} of ${totalVariants} sizes.${orientationNote} Click "Boost Quality" to unlock larger sizes.`;
        } else {
          return `Good quality at ${estimatedDpi} DPI. Qualifies for ${totalQualified} of ${totalVariants} sizes.${orientationNote} This image is already at maximum resolution for safe upscaling.`;
        }
      
      case 'needs-boost':
        if (canUpscale) {
          return `Limited quality: Only ${totalQualified} of ${totalVariants} sizes available at ${estimatedDpi} DPI. Click "Boost Quality" to improve resolution and unlock more product options.${orientationNote === ' Landscape images work best for panoramic prints.' ? ' Note: Wide landscape images may qualify for fewer variants than portrait orientation.' : ''}`;
        } else {
          // Cannot upscale - give helpful guidance
          if (orientation === 'landscape' && totalQualified < 8) {
            return `Limited quality: Only ${totalQualified} of ${totalVariants} sizes available at ${estimatedDpi} DPI. Wide landscape images (${width}×${height}px) cannot be upscaled further due to GPU memory limits. Try uploading a portrait-oriented image or a smaller landscape image for better variant availability.`;
          } else {
            return `Limited quality: Only ${totalQualified} of ${totalVariants} sizes available at ${estimatedDpi} DPI. This image is already at maximum resolution for safe upscaling. Consider uploading a higher-resolution original image.`;
          }
        }
      
      case 'rejected':
        const minDimension = orientation === 'portrait' ? '1800×2400px' : orientation === 'landscape' ? '2400×1800px' : '1800×1800px';
        return `Image resolution too low (${width}×${height}px at ${estimatedDpi} DPI). Please upload a higher-resolution image of at least ${minDimension} to ensure print quality. Current image cannot be enhanced enough for professional printing.`;
      
      default:
        return orientationNote.trim();
    }
  }
}
