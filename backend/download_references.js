const fs = require('fs');
const path = require('path');
const Jimp = require('jimp');

const breeds = [
  { key: 'gir', terms: ['Gir cattle', 'Gir cow', 'Gir bull'] },
  { key: 'sahiwal', terms: ['Sahiwal cattle', 'Sahiwal cow'] },
  { key: 'murrah_buffalo', terms: ['Murrah buffalo', 'Murrah'] },
  { key: 'tharparkar', terms: ['Tharparkar cattle', 'Tharparkar cow'] },
  { key: 'kankrej', terms: ['Kankrej cattle', 'Kankrej', 'Guzerat'] },
  { key: 'ongole', terms: ['Ongole cattle', 'Nelore cattle', 'Ongole bull'] },
  { key: 'hariana', terms: ['Hariana cattle', 'Hariana cow'] },
  { key: 'rathi', terms: ['Rathi cattle', 'Rathi cow'] },
  { key: 'deoni', terms: ['Deoni cattle', 'Deoni cow'] },
  { key: 'hallikar', terms: ['Hallikar cattle', 'Hallikar'] },
  { key: 'punganur', terms: ['Punganur cattle', 'Punganur cow'] },
  { key: 'red_kandhari', terms: ['Red Kandhari cattle', 'Red Kandhari', 'Lal Kandhari'] },
  { key: 'nimari', terms: ['Nimari cattle', 'Nimari cow'] },
  { key: 'holstein_friesian', terms: ['Holstein Friesian cattle', 'Holstein Friesian', 'Holstein cow'] },
  { key: 'jersey', terms: ['Jersey cattle', 'Jersey cow'] },
  { key: 'angus', terms: ['Aberdeen Angus', 'Angus cattle', 'Black Angus cow'] },
  { key: 'brahman', terms: ['Brahman cattle', 'Brahman bull', 'Brahman cow'] },
  { key: 'simmental', terms: ['Simmental cattle', 'Simmental cow'] },
  { key: 'limousin', terms: ['Limousin cattle', 'Limousin cow'] },
  { key: 'red_sindhi', terms: ['Red Sindhi cattle', 'Red Sindhi', 'Red Sindhi cow'] }
];

const headers = {
  'User-Agent': 'MooIDBreedBot/1.0 (https://github.com/Anih21/Moo---Id; anih21.cattle@outlook.com)'
};

async function downloadAndResizeImage(url, destPath) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  // Read using Jimp and resize to 400x400
  const image = await Jimp.read(buffer);
  await image.cover(400, 400).quality(85).writeAsync(destPath);
}

async function fetchWithTimeout(url, options = {}, timeout = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { 
      ...options, 
      headers: { ...headers, ...options.headers },
      signal: controller.signal 
    });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

async function searchAndDownload(breed) {
  const dir = path.join(__dirname, 'reference_images');
  
  for (const term of breed.terms) {
    const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(term)}&gsrnamespace=6&prop=imageinfo&iiprop=url&format=json&gsrlimit=5`;
    
    console.log(`Searching for "${term}"...`);
    try {
      const res = await fetchWithTimeout(searchUrl);
      const json = await res.json();
      
      if (json.query && json.query.pages) {
        const pages = json.query.pages;
        let imageUrl = null;
        
        // Loop through search results to find a valid image URL
        for (const id in pages) {
          const page = pages[id];
          if (page.imageinfo && page.imageinfo[0] && page.imageinfo[0].url) {
            const url = page.imageinfo[0].url;
            const extMatch = url.match(/\.(jpg|jpeg|png|webp)(\?|$)/i);
            if (extMatch) {
              imageUrl = url;
              break;
            }
          }
        }
        
        if (imageUrl) {
          const filename = `${breed.key}.jpg`; // Standardize extension to .jpg
          const destPath = path.join(dir, filename);
          console.log(`Downloading and resizing image for ${breed.key}: ${imageUrl}`);
          await downloadAndResizeImage(imageUrl, destPath);
          console.log(`Saved and resized: ${filename}\n`);
          return true; // Successfully downloaded
        }
      }
    } catch (err) {
      console.error(`Error searching or downloading for "${term}":`, err.message);
    }
    // Sleep a bit between terms if we fail, to avoid hammering
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.warn(`⚠️ Warning: Failed to download reference image for "${breed.key}" using all terms.`);
  return false;
}

async function main() {
  const dir = path.join(__dirname, 'reference_images');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  } else {
    // Clear existing reference files (both png and new files) to avoid pollution
    console.log("Cleaning up existing files in reference_images/...");
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      if (fs.statSync(filePath).isFile()) {
        fs.unlinkSync(filePath);
      }
    }
    console.log("Cleanup complete.\n");
  }

  console.log("Starting reference images download from Wikimedia Commons...");
  let successCount = 0;
  for (const breed of breeds) {
    console.log(`----------------------------------------`);
    console.log(`Breed: ${breed.key}`);
    const success = await searchAndDownload(breed);
    if (success) successCount++;
    // Sleep 1.5 seconds between breeds to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  
  console.log(`----------------------------------------`);
  console.log(`Download finished! Successfully downloaded ${successCount}/${breeds.length} reference images.`);
}

main().catch(console.error);
