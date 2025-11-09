import fs from "fs";

interface ImageDimensions {
  width: number;
  height: number;
}

export function getImageDimensions(filePath: string): ImageDimensions | null {
  try {
    const buffer = fs.readFileSync(filePath);
    
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

// Printify wall art quality requirements:
// - 8"x10" at 300 DPI = 2400x3000 pixels
// - We'll use this as minimum for quality prints
export const MIN_WIDTH = 2400;
export const MIN_HEIGHT = 3000;

export function validateImageQuality(filePath: string): { valid: boolean; message?: string; dimensions?: ImageDimensions } {
  const dimensions = getImageDimensions(filePath);
  
  if (!dimensions) {
    return {
      valid: false,
      message: "Unable to read image dimensions. Please upload a valid PNG or JPEG image.",
    };
  }
  
  const { width, height } = dimensions;
  
  // Check if either orientation meets the minimum (landscape or portrait)
  const meetsMinimum = 
    (width >= MIN_WIDTH && height >= MIN_HEIGHT) ||
    (width >= MIN_HEIGHT && height >= MIN_WIDTH);
  
  if (!meetsMinimum) {
    return {
      valid: false,
      message: `Image resolution too low. Minimum ${MIN_WIDTH}×${MIN_HEIGHT} pixels required for quality prints. Your image is ${width}×${height} pixels.`,
      dimensions,
    };
  }
  
  return {
    valid: true,
    dimensions,
  };
}
