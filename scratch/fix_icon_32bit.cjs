const sharp = require('sharp');
const path = require('path');

const inputIcon = 'd:/DARY/public/pwa-icon.png';
const outputDir = 'd:/DARY/scratch/mypos_assets/';

async function fixIcon() {
  try {
    // We create a 512x512 transparent image and composite the icon on top
    // This forces the output to be RGBA (32-bit)
    const base = Buffer.alloc(512 * 512 * 4, 0); // Transparent base
    
    await sharp(inputIcon)
      .resize(512, 512)
      .ensureAlpha()
      .png({ palette: false }) // Explicitly disable palette to avoid 8-bit optimization
      .toFile(path.join(outputDir, 'app_icon_final_32bit.png'));
    
    console.log('Icon processed: 512x512, attempted 32-bit PNG');

  } catch (err) {
    console.error('Error processing icon:', err);
  }
}

fixIcon();
