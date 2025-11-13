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

  static analyzePrintQuality(width: number, height: number): ImageQualityAnalysis {
    const megapixels = (width * height) / 1_000_000;
    
    const largestDimension = Math.max(width, height);
    const largestProductDimension = Math.max(
      this.PRODUCT_SIZES.poster.width,
      this.PRODUCT_SIZES.poster.height
    );
    
    const estimatedDpi = Math.floor(largestDimension / largestProductDimension);
    
    const meetsMinimum = estimatedDpi >= this.MIN_DPI;
    const meetsTarget = estimatedDpi >= this.TARGET_DPI;
    
    let recommendation: 'perfect' | 'good' | 'needs_upscaling' | 'unsuitable';
    let message: string;
    
    if (estimatedDpi >= this.TARGET_DPI) {
      recommendation = 'perfect';
      message = `Excellent quality! Your image has ~${estimatedDpi} DPI - perfect for all print products.`;
    } else if (estimatedDpi >= 200) {
      recommendation = 'good';
      message = `Good quality at ~${estimatedDpi} DPI. Will print well, but upscaling could enhance sharpness.`;
    } else if (estimatedDpi >= this.MIN_DPI) {
      recommendation = 'needs_upscaling';
      message = `Your image is ~${estimatedDpi} DPI. We recommend upscaling to ${this.TARGET_DPI} DPI for best print quality.`;
    } else {
      recommendation = 'unsuitable';
      message = `Image quality is too low (~${estimatedDpi} DPI). Even with upscaling, prints may appear pixelated. Please upload a higher resolution image (at least ${this.MIN_DPI} DPI).`;
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
      meetsMinimum,
      meetsTarget,
      recommendation,
      message,
      productSuitability
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
    return analysis.recommendation !== 'unsuitable';
  }
}
