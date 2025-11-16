import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const mockupFiles = [
  'mockup-living',
  'mockup-bedroom',
  'mockup-office',
  'mockup-gallery'
];

const assetsDir = join(__dirname, '../attached_assets/theme/assets');

async function createThumbnails() {
  console.log('Creating mockup thumbnails (120x120px)...\n');
  
  for (const mockup of mockupFiles) {
    const inputPath = join(assetsDir, `${mockup}.png`);
    const outputPath = join(assetsDir, `${mockup}-thumb.png`);
    
    try {
      await sharp(inputPath)
        .resize(120, 120, {
          fit: 'cover',
          position: 'center'
        })
        .png({ quality: 90 })
        .toFile(outputPath);
      
      console.log(`✅ Created ${mockup}-thumb.png`);
    } catch (error) {
      console.error(`❌ Error creating ${mockup}-thumb.png:`, error.message);
    }
  }
  
  console.log('\n✅ All thumbnails created!');
}

createThumbnails();
