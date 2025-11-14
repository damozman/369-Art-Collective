export interface ProductVariantQualification {
  variantKey: string;
  productName: string;
  widthInches: number;
  heightInches: number;
  qualified: boolean;
  requiredPixels: { width: number; height: number };
}

export interface ImageQualityAnalysis {
  width: number;
  height: number;
  megapixels: number;
  estimatedDpi: number;
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
    } else if (qualified.length >= 9) {
      recommendation = 'needs_upscaling';
      message = `Your image qualifies for ${qualified.length}/${this.PRODUCT_VARIANTS.length} variants at ~${estimatedDpi} DPI. Upscaling recommended to unlock all sizes.`;
    } else if (qualified.length > 0) {
      recommendation = 'unsuitable';
      message = `Limited quality: only ${qualified.length}/${this.PRODUCT_VARIANTS.length} variants qualify. Please upload a higher resolution image (minimum 2700×3600 pixels for 9+ variants).`;
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
    
    return {
      width,
      height,
      megapixels: parseFloat(megapixels.toFixed(2)),
      estimatedDpi,
      meetsMinimum: qualified.length >= 9,
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
    return analysis.recommendation === 'needs_upscaling' || analysis.recommendation === 'good';
  }

  static getUpscaleScale(width: number, height: number): 2 | 4 {
    const analysis = this.analyzePrintQuality(width, height);
    
    if (analysis.estimatedDpi >= 200) {
      return 2;
    }
    
    return 4;
  }

  static isAcceptableForPrint(width: number, height: number): boolean {
    const analysis = this.analyzePrintQuality(width, height);
    return analysis.variantQualification.totalQualified >= 9;
  }
  
  static getQualifiedVariantKeys(width: number, height: number): string[] {
    const analysis = this.analyzePrintQuality(width, height);
    return analysis.variantQualification.qualified.map(v => v.variantKey);
  }
}
