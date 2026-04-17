const sharp = require('sharp');
const path = require('path');

const inputBanner = 'd:/DARY/scratch/mypos_assets/app_banner.png';
const inputIcon = 'd:/DARY/scratch/mypos_assets/app_icon.png';
const outputDir = 'd:/DARY/scratch/mypos_assets/';

async function processImages() {
  try {
    // Process Banner: 720x400, no alpha
    await sharp(inputBanner)
      .resize(720, 400)
      .flatten({ background: { r: 26, g: 26, b: 26 } }) // Match the app's dark theme background
      .toFile(path.join(outputDir, 'app_banner_final.png'));
    
    console.log('Banner processed: 720x400, no alpha');

    // Process Icon: 512x512, with alpha
    await sharp(inputIcon)
      .resize(512, 512)
      .toFile(path.join(outputDir, 'app_icon_final.png'));
    
    console.log('Icon processed: 512x512, with alpha');

  } catch (err) {
    console.error('Error processing images:', err);
  }
}

processImages();
