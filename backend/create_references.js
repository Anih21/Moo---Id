const Jimp = require('jimp');
const fs = require('fs');
const path = require('path');

const breeds = [
  { name: 'gir', bg: 0x8B2500FF, patches: true, patchColor: 0xFFFFFFFF },
  { name: 'sahiwal', bg: 0xB22222FF },
  { name: 'murrah_buffalo', bg: 0x1A1A1AFF, horns: true },
  { name: 'tharparkar', bg: 0xD3D3D3FF },
  { name: 'kankrej', bg: 0xC0C0C0FF, gradient: true },
  { name: 'ongole', bg: 0xF5F5F5FF, spots: true, spotColor: 0x808080FF },
  { name: 'hariana', bg: 0xE5E5E5FF },
  { name: 'rathi', bg: 0xCD853FFF, spots: true, spotColor: 0xFFFFFFFF },
  { name: 'deoni', bg: 0xFFFFFFFF, largePatches: true, patchColor: 0x000000FF },
  { name: 'hallikar', bg: 0x708090FF },
  { name: 'punganur', bg: 0xF5DEB3FF },
  { name: 'red_kandhari', bg: 0x800000FF },
  { name: 'nimari', bg: 0x8B4513FF, spots: true, spotColor: 0xFFFFFFFF },
  { name: 'holstein_friesian', bg: 0xFFFFFFFF, largePatches: true, patchColor: 0x000000FF },
  { name: 'jersey', bg: 0xDEB887FF, muzzle: true },
  { name: 'angus', bg: 0x050505FF },
  { name: 'brahman', bg: 0xE0E0E0FF, hump: true },
  { name: 'simmental', bg: 0xDAA520FF, patches: true, patchColor: 0xFFFFFFFF },
  { name: 'limousin', bg: 0xD2691EFF },
  { name: 'red_sindhi', bg: 0x8B0000FF }
];

async function generateAll() {
  const dir = path.join(__dirname, 'reference_images');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  for (const breed of breeds) {
    const img = await new Jimp(224, 224, breed.bg);

    // Add visual characteristics to make embeddings distinct
    if (breed.spots) {
      // Paint random small circles/spots
      for (let i = 0; i < 15; i++) {
        const cx = Math.floor(Math.random() * 224);
        const cy = Math.floor(Math.random() * 224);
        const r = 5 + Math.floor(Math.random() * 10);
        drawCircle(img, cx, cy, r, breed.spotColor);
      }
    }

    if (breed.patches) {
      // Paint larger patches
      for (let i = 0; i < 5; i++) {
        const cx = Math.floor(Math.random() * 224);
        const cy = Math.floor(Math.random() * 224);
        const r = 20 + Math.floor(Math.random() * 30);
        drawCircle(img, cx, cy, r, breed.patchColor);
      }
    }

    if (breed.largePatches) {
      // Bold patches (like Holstein/Deoni)
      for (let i = 0; i < 4; i++) {
        const cx = Math.floor(Math.random() * 224);
        const cy = Math.floor(Math.random() * 224);
        const r = 40 + Math.floor(Math.random() * 50);
        drawCircle(img, cx, cy, r, breed.patchColor);
      }
    }

    if (breed.horns) {
      // Draw a black horn arc
      for (let x = 60; x < 160; x++) {
        const y = Math.floor(60 + Math.sin((x - 60) * Math.PI / 100) * 40);
        drawCircle(img, x, y, 8, 0x050505FF);
      }
    }

    if (breed.muzzle) {
      // Dark nose area
      drawCircle(img, 112, 180, 30, 0x3E2723FF);
      drawCircle(img, 112, 180, 20, 0x1A0F0DFF);
    }

    if (breed.hump) {
      // Draw a dark hump shape near the top center
      drawCircle(img, 112, 80, 35, 0x9E9E9EFF);
    }

    if (breed.gradient) {
      // Horizontal color gradient
      img.scan(0, 0, 224, 224, function (x, y, idx) {
        const factor = x / 224;
        this.bitmap.data[idx] = Math.max(0, this.bitmap.data[idx] - factor * 80);
        this.bitmap.data[idx+1] = Math.max(0, this.bitmap.data[idx+1] - factor * 80);
        this.bitmap.data[idx+2] = Math.max(0, this.bitmap.data[idx+2] - factor * 80);
      });
    }

    const filename = `${breed.name}.png`;
    const filepath = path.join(dir, filename);
    await img.writeAsync(filepath);
    console.log(`Generated reference image: ${filename}`);
  }
}

function drawCircle(img, cx, cy, r, color) {
  const r2 = r * r;
  img.scan(0, 0, 224, 224, function (x, y, idx) {
    const dx = x - cx;
    const dy = y - cy;
    if (dx * dx + dy * dy <= r2) {
      // Get RGBA components from hex color
      const r_val = (color >> 24) & 0xFF;
      const g_val = (color >> 16) & 0xFF;
      const b_val = (color >> 8) & 0xFF;
      const a_val = color & 0xFF;
      
      if (a_val === 255) {
        this.bitmap.data[idx] = r_val;
        this.bitmap.data[idx + 1] = g_val;
        this.bitmap.data[idx + 2] = b_val;
      }
    }
  });
}

generateAll().catch(console.error);
