import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple function to create a high-resolution PNG with solid color
function createPNG(width, height, r, g, b, outputPath) {
  const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  
  // Create IHDR chunk (image header)
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(2, 9); // color type (RGB)
  ihdr.writeUInt8(0, 10); // compression
  ihdr.writeUInt8(0, 11); // filter
  ihdr.writeUInt8(0, 12); // interlace
  
  const ihdrChunk = createChunk('IHDR', ihdr);
  
  // Create image data (simplified - each row starts with filter byte 0)
  const bytesPerPixel = 3; // RGB
  const rowSize = 1 + (width * bytesPerPixel); // filter byte + pixel data
  const imageData = Buffer.alloc(height * rowSize);
  
  for (let y = 0; y < height; y++) {
    const rowStart = y * rowSize;
    imageData[rowStart] = 0; // filter byte
    
    for (let x = 0; x < width; x++) {
      const pixelStart = rowStart + 1 + (x * bytesPerPixel);
      imageData[pixelStart] = r;
      imageData[pixelStart + 1] = g;
      imageData[pixelStart + 2] = b;
    }
  }
  
  // Compress image data with zlib
  const compressedData = zlib.deflateSync(imageData, { level: 1 });
  const idatChunk = createChunk('IDAT', compressedData);
  
  // Create IEND chunk (image end)
  const iendChunk = createChunk('IEND', Buffer.alloc(0));
  
  // Combine all chunks
  const pngBuffer = Buffer.concat([
    PNG_SIGNATURE,
    ihdrChunk,
    idatChunk,
    iendChunk
  ]);
  
  fs.writeFileSync(outputPath, pngBuffer);
  console.log(`Created ${outputPath} (${width}x${height})`);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  
  const typeBuffer = Buffer.from(type, 'ascii');
  
  // Calculate CRC
  const crcBuffer = Buffer.concat([typeBuffer, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(calculateCRC(crcBuffer), 0);
  
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function calculateCRC(buffer) {
  let crc = 0xFFFFFFFF;
  
  for (let i = 0; i < buffer.length; i++) {
    crc = crc ^ buffer[i];
    for (let j = 0; j < 8; j++) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ 0xEDB88320;
      } else {
        crc = crc >>> 1;
      }
    }
  }
  
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Create test assets directory
const assetsDir = path.join(__dirname, '..', 'tests', 'assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

// Generate 3 high-resolution test images (2400x3000 pixels)
createPNG(2400, 3000, 255, 100, 150, path.join(assetsDir, 'portfolio1.png')); // Pink
createPNG(2400, 3000, 100, 150, 255, path.join(assetsDir, 'portfolio2.png')); // Blue
createPNG(2400, 3000, 255, 200, 100, path.join(assetsDir, 'portfolio3.png')); // Orange

console.log('✓ All test images created successfully!');
