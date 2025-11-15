import fs from "fs";

interface ImageDimensions {
  width: number;
  height: number;
}

export function getImageDimensionsFromBuffer(buffer: Buffer): ImageDimensions | null {
  try {
    // PNG format
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      return { width, height };
    }
    
    // JPEG format
    if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
      let offset = 2;
      while (offset < buffer.length) {
        if (buffer[offset] !== 0xFF) break;
        
        const marker = buffer[offset + 1];
        if (marker === 0xC0 || marker === 0xC2) {
          const height = buffer.readUInt16BE(offset + 5);
          const width = buffer.readUInt16BE(offset + 7);
          return { width, height };
        }
        
        offset += 2 + buffer.readUInt16BE(offset + 2);
      }
    }
    
    return null;
  } catch (error) {
    console.error("Error reading image dimensions:", error);
    return null;
  }
}

export function getImageDimensions(filePath: string): ImageDimensions | null {
  try {
    const buffer = fs.readFileSync(filePath);
    return getImageDimensionsFromBuffer(buffer);
  } catch (error) {
    console.error("Error reading image dimensions:", error);
    return null;
  }
}

// Printify wall art quality requirements (flexible for various orientations):
// - 18"x24" at 150 DPI = 2700x3600 pixels (minimum for 8/12 small+medium variants)
// - 24"x36" at 150 DPI = 3600x5400 pixels (all 12 variants)
// Requirements: At least 2700px on shortest side, 3600px on longest side
export const MIN_SHORT_SIDE = 2700;
export const MIN_LONG_SIDE = 3600;

export function validateImageQualityFromBuffer(buffer: Buffer): { valid: boolean; message?: string; dimensions?: ImageDimensions } {
  const dimensions = getImageDimensionsFromBuffer(buffer);
  
  if (!dimensions) {
    return {
      valid: false,
      message: "Unable to read image dimensions. Please upload a valid PNG or JPEG image.",
    };
  }
  
  const { width, height } = dimensions;
  
  // Determine short and long sides (works for any orientation)
  const shortSide = Math.min(width, height);
  const longSide = Math.max(width, height);
  
  // Check if image meets flexible quality requirements
  const meetsMinimum = shortSide >= MIN_SHORT_SIDE && longSide >= MIN_LONG_SIDE;
  
  if (!meetsMinimum) {
    return {
      valid: false,
      message: `Image resolution too low. Minimum ${MIN_LONG_SIDE}×${MIN_SHORT_SIDE} pixels required for quality prints. Your image is ${width}×${height} pixels.`,
      dimensions,
    };
  }
  
  return {
    valid: true,
    dimensions,
  };
}

export function validateImageQuality(filePath: string): { valid: boolean; message?: string; dimensions?: ImageDimensions } {
  const dimensions = getImageDimensions(filePath);
  
  if (!dimensions) {
    return {
      valid: false,
      message: "Unable to read image dimensions. Please upload a valid PNG or JPEG image.",
    };
  }
  
  const { width, height } = dimensions;
  
  // Determine short and long sides (works for any orientation)
  const shortSide = Math.min(width, height);
  const longSide = Math.max(width, height);
  
  // Check if image meets flexible quality requirements
  const meetsMinimum = shortSide >= MIN_SHORT_SIDE && longSide >= MIN_LONG_SIDE;
  
  if (!meetsMinimum) {
    return {
      valid: false,
      message: `Image resolution too low. Minimum ${MIN_LONG_SIDE}×${MIN_SHORT_SIDE} pixels required for quality prints. Your image is ${width}×${height} pixels.`,
      dimensions,
    };
  }
  
  return {
    valid: true,
    dimensions,
  };
}
