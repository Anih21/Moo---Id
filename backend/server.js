const Jimp = require('jimp');
const tf = require('@tensorflow/tfjs');
const mobilenet = require('@tensorflow-models/mobilenet');
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../frontend')));

let net = null;
const referenceEmbeddings = {}; // Maps normalized breed names to 1D embedding arrays

// Helper to convert Jimp image to 3D Tensor
async function jimpToTensor(jimpImage) {
  jimpImage.cover(224, 224);
  const numChannels = 3;
  const numPixels = jimpImage.bitmap.width * jimpImage.bitmap.height;
  const values = new Int32Array(numPixels * numChannels);
  
  let offset = 0;
  jimpImage.scan(0, 0, jimpImage.bitmap.width, jimpImage.bitmap.height, function (x, y, idx) {
    values[offset] = this.bitmap.data[idx];     // R
    values[offset + 1] = this.bitmap.data[idx + 1]; // G
    values[offset + 2] = this.bitmap.data[idx + 2]; // B
    offset += 3;
  });
  
  return tf.tensor3d(values, [224, 224, 3], 'int32');
}

// Compute embedding for a buffer
async function computeEmbedding(buffer) {
  const jimpImage = await Jimp.read(buffer);
  const tensor = await jimpToTensor(jimpImage);
  const embedding = net.infer(tensor, true);
  const data = await embedding.data(); // Get 1D float array
  tensor.dispose();
  embedding.dispose();
  return Array.from(data);
}

// Cosine similarity between two vectors
function cosineSimilarity(a, b) {
  let dotProduct = 0;
  let mA = 0;
  let mB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += (a[i] * b[i]);
    mA += (a[i] * a[i]);
    mB += (b[i] * b[i]);
  }
  mA = Math.sqrt(mA);
  mB = Math.sqrt(mB);
  if (mA === 0 || mB === 0) return 0;
  return dotProduct / (mA * mB);
}

// Load precomputed or dynamic breed reference images from directory
async function loadReferenceImages() {
  const dir = path.join(__dirname, 'reference_images');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  const files = fs.readdirSync(dir);
  console.log(`Found ${files.length} reference image files in ${dir}`);
  
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
      const breedKey = path.basename(file, ext).toLowerCase();
      const filePath = path.join(dir, file);
      try {
        const buffer = fs.readFileSync(filePath);
        const embedding = await computeEmbedding(buffer);
        referenceEmbeddings[breedKey] = embedding;
        console.log(`Successfully loaded reference embedding for: ${breedKey}`);
      } catch (err) {
        console.error(`Error loading reference image ${file}:`, err);
      }
    }
  }
}

// API to identify the breed based on 4 uploaded images
app.post('/api/identify', async (req, res) => {
  try {
    const { images } = req.body;
    if (!images || !Array.isArray(images) || images.length !== 4) {
      return res.status(400).json({ error: "Please upload exactly 4 images." });
    }
    
    if (Object.keys(referenceEmbeddings).length === 0) {
      return res.status(500).json({ error: "Server error: No reference breed images are loaded in the backend database." });
    }
    
    const embeddings = [];
    for (let i = 0; i < images.length; i++) {
      const base64Data = images[i].replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, 'base64');
      const embedding = await computeEmbedding(buffer);
      embeddings.push(embedding);
    }
    
    // Average the 4 embeddings to get a robust profile
    const embeddingSize = embeddings[0].length;
    const avgEmbedding = new Array(embeddingSize).fill(0);
    for (let i = 0; i < embeddingSize; i++) {
      let sum = 0;
      for (let j = 0; j < embeddings.length; j++) {
        sum += embeddings[j][i];
      }
      avgEmbedding[i] = sum / embeddings.length;
    }
    
    // Compare similarity against all reference images
    let bestMatchKey = null;
    let maxSimilarity = -1;
    
    for (const [breedKey, refEmbedding] of Object.entries(referenceEmbeddings)) {
      const similarity = cosineSimilarity(avgEmbedding, refEmbedding);
      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
        bestMatchKey = breedKey;
      }
    }
    
    console.log(`Best match: ${bestMatchKey} with similarity score: ${maxSimilarity.toFixed(4)}`);
    
    // Threshold check (e.g. 0.65 to ensure it is actually a cow/bull of a known breed)
    const SIMILARITY_THRESHOLD = 0.65;
    if (maxSimilarity < SIMILARITY_THRESHOLD) {
      return res.status(400).json({
        error: "Unrecognized animal/object. The uploaded photos do not sufficiently match any of the available cattle breeds. Please ensure the photos are clear, showing a cow or bull, and are not documents or unrelated objects.",
        confidence: `${(maxSimilarity * 100).toFixed(0)}%`,
        maxSimilarity
      });
    }
    
    // Map the breedKey back to the database name
    const keyToNameMap = {
      "gir": "Gir",
      "sahiwal": "Sahiwal",
      "murrah_buffalo": "Murrah Buffalo",
      "tharparkar": "Tharparkar",
      "kankrej": "Kankrej",
      "ongole": "Ongole",
      "hariana": "Hariana",
      "rathi": "Rathi",
      "deoni": "Deoni",
      "hallikar": "Hallikar",
      "punganur": "Punganur",
      "red_kandhari": "Red Kandhari",
      "nimari": "Nimari",
      "holstein_friesian": "Holstein-Friesian",
      "jersey": "Jersey",
      "angus": "Angus",
      "brahman": "Brahman",
      "simmental": "Simmental",
      "limousin": "Limousin",
      "red_sindhi": "Red Sindhi"
    };
    
    const matchedName = keyToNameMap[bestMatchKey] || bestMatchKey;
    
    // Map confidence score (scale similarity from threshold to 1.0 into 75% to 98%)
    let confidencePercent = 75;
    if (maxSimilarity >= 1.0) {
      confidencePercent = 98;
    } else if (maxSimilarity > SIMILARITY_THRESHOLD) {
      const fraction = (maxSimilarity - SIMILARITY_THRESHOLD) / (1.0 - SIMILARITY_THRESHOLD);
      confidencePercent = Math.round(75 + fraction * 23);
    }
    
    return res.json({
      breedName: matchedName,
      confidence: `${confidencePercent}%`,
      similarity: maxSimilarity
    });
  } catch (err) {
    console.error("Error in /api/identify:", err);
    res.status(500).json({ error: "Internal server error during analysis: " + err.message });
  }
});

const PORT = process.env.PORT || 3000;

async function startServer() {
  console.log("Loading MobileNet model...");
  net = await mobilenet.load({
    version: 1,
    alpha: 1.0
  });
  console.log("MobileNet model loaded successfully.");
  
  await loadReferenceImages();
  
  app.listen(PORT, () => {
    console.log(`MooID server listening on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
});
