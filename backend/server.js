/**
 * MooID — Backend Server
 * Gemini 2.5 Flash multimodal cattle breed identification
 * Target accuracy: 95%+
 */

'use strict';

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

// ─── Load .env ────────────────────────────────────────────────────────────────
(function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .forEach(line => {
      line = line.trim();
      if (!line || line.startsWith('#')) return;
      const eqIdx = line.indexOf('=');
      if (eqIdx < 1) return;
      const key   = line.slice(0, eqIdx).trim();
      const value = line.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (key && !process.env[key]) process.env[key] = value;
    });
})();

// ─── App setup ────────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json({ limit: '60mb' }));
app.use(express.static(path.join(__dirname, '../frontend')));

// ─── Breed master list (must match frontend exactly) ──────────────────────────
const BREED_LIST = [
  'Gir', 'Sahiwal', 'Murrah Buffalo', 'Tharparkar', 'Kankrej',
  'Ongole', 'Hariana', 'Rathi', 'Deoni', 'Hallikar',
  'Punganur', 'Red Kandhari', 'Nimari',
  'Holstein-Friesian', 'Jersey', 'Angus', 'Brahman', 'Simmental',
  'Limousin', 'Red Sindhi'
];

// ─── Breed visual cheat-sheet injected into the prompt ────────────────────────
// These expert hints guide Gemini toward the distinguishing traits of each breed,
// which is the primary lever for pushing accuracy above 95%.
const BREED_VISUAL_GUIDE = `
BREED IDENTIFICATION REFERENCE (use this to distinguish similar-looking breeds):

INDIAN ZEBU / HUMPED BREEDS:
• Gir          — Large pendulous ears, convex forehead dome (Roman nose), red+white patches, prominent hump; calm expression.
• Sahiwal       — Short stumpy horns, very loose thick skin with deep folds, reddish-brown, no dominant patches. Dewlap large.
• Kankrej       — Lyre-shaped upswept horns, silver-grey to iron-grey coat, very muscular, one of the tallest Indian breeds.
• Ongole        — White/light-grey, black skin pigment visible around eyes/muzzle/hooves, massive body, very large hump and dewlap.
• Tharparkar    — Pure white to grey-white, medium hump, slender legs, adapted desert build. No patchy coat.
• Hariana       — Clean white/grey-white, fine slender horns, elegant slim build, medium hump. Often confused with Tharparkar but slimmer.
• Rathi         — Brown with irregular white patches/spots, compact body, medium hump, moderate dewlap.
• Deoni         — Bold large black-and-white irregular patches (Holstein-like but with prominent hump and Indian Zebu ears).
• Hallikar      — Compact muscular grey/dark-grey body, sharp thin face, very upright horns, tight skin, no excess dewlap.
• Punganur      — Extremely small body (miniature), often white or light-reddish, tiny compact frame, short horns.
• Red Kandhari  — Deep brick-red to dark red coat, short compact body, short inward-curved horns.
• Nimari        — Red-brown coat with white patches, strong medium frame, from river valley region.

BUFFALO:
• Murrah Buffalo — Jet-black, tightly coiled horns (curved inward toward back), no visible hump (buffalo not bovine), heavy pendulous body.

INTERNATIONAL / EXOTIC BREEDS (no hump, European/American build):
• Holstein-Friesian — Distinctive large black-and-white patches, no hump, very large frame, straight back.
• Jersey           — Small-to-medium frame, fawn/light-brown, large doe-like eyes, dark muzzle ring, fine bone structure.
• Angus            — Solid jet-black (or red), no horns (polled), compact muscular beef body, no hump, short neck.
• Brahman          — Very large hump over shoulders, pendulous dewlap and ears, light-grey to dark-grey, USA beef breed.
• Simmental        — Large yellow-red/golden-red coat with white face and patches, heavy dual-purpose frame, white legs common.
• Limousin         — Uniform golden-red to wheat-yellow coat, no white patches, muscular hindquarters, fine head.
• Red Sindhi       — Deep red, compact, short horns, similar to Sahiwal but smaller and deeper red without loose skin folds.

KEY DIFFERENTIATORS:
- If there is a large shoulder hump → Indian Zebu or Brahman (Brahman = USA breed, larger; Indian breeds = smaller frame)
- If jet-black + tightly coiled horns → Murrah Buffalo (NOT Angus; Angus has no horns and no hump)
- If black-and-white patches + hump visible → Deoni (NOT Holstein; Holstein has no hump)
- If black-and-white patches + NO hump, large frame → Holstein-Friesian
- If solid black + no horns + beefy → Angus
- If golden/yellow-red + white face → Simmental
- If uniform golden-red, no white → Limousin
`.trim();

// ─── Build the master Gemini prompt ───────────────────────────────────────────
function buildPrompt() {
  const breedListStr = BREED_LIST.join(', ');
  return `You are Dr. Aryan Mehta, a world-renowned expert in bovine genetics, veterinary science, and livestock breed classification with 30+ years of field experience across India, Europe, and North America.

You have been given FOUR photographs of the same animal taken from four perspectives:
  Image 1 = FRONT VIEW  (face and head)
  Image 2 = BACK VIEW   (rear and tail)
  Image 3 = LEFT SIDE   (full body from left)
  Image 4 = RIGHT SIDE  (full body from right)

Your task is to examine all four images together as a complete morphological profile and identify the exact breed.

${BREED_VISUAL_GUIDE}

SUPPORTED BREED LIST (you MUST pick exactly one of these names, with exact spelling and capitalisation):
${breedListStr}

DECISION PROCESS — follow this chain of reasoning before answering:
1. Is the animal a bovine (cow/bull/buffalo)?  If not → success=false.
2. Is it a buffalo (no hump, coiled horns, black)? → Murrah Buffalo.
3. Does it have a hump?  → Indian Zebu or Brahman.
4. Examine coat colour, pattern, horn shape, ear size, body size, dewlap, hump height, and any distinctive markings.
5. Cross-reference your observations against the visual guide above.
6. Select the single best matching breed from the supported list.
7. Assign a confidence score reflecting your certainty (integer, 75–99).

OUTPUT RULES:
- Return valid JSON only. No markdown, no explanation text.
- "success": true if breed identified, false if not a bovine or breed not in the list.
- "breedName": exact name from the supported list (empty string if success=false).
- "confidence": integer 75–99 (0 if success=false).
- "error": descriptive error message (empty string if success=true).
- "reasoning": 1–2 sentence summary of the key visual traits that led to your identification.`;
}

// ─── Parse base64 data URL ────────────────────────────────────────────────────
function parseBase64Image(dataUrl) {
  const m = dataUrl.match(/^data:(image\/[\w+]+);base64,(.+)$/);
  if (m) return { mimeType: m[1], data: m[2] };
  return { mimeType: 'image/jpeg', data: dataUrl };
}

// ─── /api/identify  POST ──────────────────────────────────────────────────────
app.post('/api/identify', async (req, res) => {
  try {
    // ── Validate input ──────────────────────────────────────────────────────
    const { images } = req.body;
    if (!images || !Array.isArray(images) || images.length !== 4) {
      return res.status(400).json({ error: 'Exactly 4 images are required (front, back, left, right).' });
    }

    // ── Check API key ───────────────────────────────────────────────────────
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your_gemini_api_key_here') {
      return res.status(500).json({
        error: 'GEMINI_API_KEY is not configured. Open backend/.env and paste your key from https://aistudio.google.com/app/apikey'
      });
    }

    console.log(`[${new Date().toISOString()}] Breed identification request received.`);

    // ── Build parts array ───────────────────────────────────────────────────
    const VIEW_LABELS = ['FRONT VIEW', 'BACK VIEW', 'LEFT SIDE', 'RIGHT SIDE'];
    const parts = [{ text: buildPrompt() }];

    for (let i = 0; i < 4; i++) {
      const { mimeType, data } = parseBase64Image(images[i]);
      parts.push({ text: `\n--- ${VIEW_LABELS[i]} ---` });
      parts.push({ inlineData: { mimeType, data } });
    }

    // ── Gemini request payload ──────────────────────────────────────────────
    const payload = {
      contents: [{ role: 'user', parts }],

      // System instruction makes Gemini adopt the expert persona persistently
      systemInstruction: {
        parts: [{
          text: 'You are an expert cattle breed classifier. Always respond with a single valid JSON object and nothing else. Never add markdown code fences or explanatory text outside the JSON.'
        }]
      },

      generationConfig: {
        temperature: 0.1,          // Low temperature = deterministic, precise
        topP: 0.85,
        topK: 20,
        maxOutputTokens: 512,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            success:   { type: 'BOOLEAN' },
            breedName: { type: 'STRING' },
            confidence:{ type: 'INTEGER' },
            error:     { type: 'STRING' },
            reasoning: { type: 'STRING' }
          },
          required: ['success', 'breedName', 'confidence', 'error', 'reasoning']
        }
      },

      // Safety settings — relaxed for livestock analysis (animals, not harmful content)
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT',       threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH',      threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT',threshold: 'BLOCK_NONE' }
      ]
    };

    // ── Call Gemini 2.5 Flash ───────────────────────────────────────────────
    const MODEL   = 'gemini-2.5-flash';
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

    const apiResponse = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    // ── Handle Gemini errors ────────────────────────────────────────────────
    if (!apiResponse.ok) {
      const errBody = await apiResponse.text();
      console.error('Gemini API error:', apiResponse.status, errBody);

      // Surface a clean message for quota / auth issues
      if (apiResponse.status === 400) return res.status(400).json({ error: 'Invalid request to Gemini API. Check your images and API key.' });
      if (apiResponse.status === 403) return res.status(500).json({ error: 'API key is invalid or lacks permission. Check https://aistudio.google.com/app/apikey' });
      if (apiResponse.status === 429) return res.status(429).json({ error: 'Gemini API rate limit reached. Please wait a moment and try again.' });

      return res.status(500).json({ error: `Gemini API returned ${apiResponse.status}: ${apiResponse.statusText}` });
    }

    // ── Parse response ──────────────────────────────────────────────────────
    const apiData = await apiResponse.json();

    if (!apiData.candidates?.length) {
      const blockReason = apiData.promptFeedback?.blockReason || 'unknown';
      console.error('No candidates returned. Block reason:', blockReason);
      return res.status(500).json({ error: `Gemini returned no candidates (block reason: ${blockReason}). Try different photos.` });
    }

    const candidate = apiData.candidates[0];

    // Check finish reason
    if (candidate.finishReason && candidate.finishReason !== 'STOP') {
      console.warn('Unexpected finish reason:', candidate.finishReason);
    }

    let result;
    try {
      const rawText = candidate.content.parts[0].text;
      result = JSON.parse(rawText);
    } catch (parseErr) {
      console.error('Failed to parse Gemini JSON:', parseErr);
      return res.status(500).json({ error: 'Gemini returned malformed JSON. Please try again.' });
    }

    console.log(`[${new Date().toISOString()}] Gemini result:`, JSON.stringify(result));

    // ── Validate breed name is in supported list ────────────────────────────
    if (result.success) {
      const isValidBreed = BREED_LIST.some(
        b => b.toLowerCase() === (result.breedName || '').toLowerCase()
      );
      if (!isValidBreed) {
        console.warn('Gemini returned unknown breed:', result.breedName);
        return res.status(400).json({
          error: `Breed "${result.breedName}" is not in the supported database. The animal may be a different breed not yet in our system.`
        });
      }

      // Normalise capitalisation to exactly match our master list
      const canonicalName = BREED_LIST.find(
        b => b.toLowerCase() === result.breedName.toLowerCase()
      );

      return res.json({
        breedName:  canonicalName,
        confidence: `${Math.max(75, Math.min(99, result.confidence))}%`,
        reasoning:  result.reasoning || ''
      });
    } else {
      return res.status(400).json({
        error: result.error || 'The animal could not be identified. Please ensure photos clearly show a cow, bull, or buffalo.'
      });
    }

  } catch (err) {
    console.error('Unhandled error in /api/identify:', err);
    res.status(500).json({ error: 'Internal server error: ' + err.message });
  }
});

// ─── Health check endpoint ────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  const keyConfigured = !!(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here');
  res.json({
    status:  'ok',
    service: 'MooID Backend',
    model:   'gemini-2.5-flash',
    apiKeyConfigured: keyConfigured,
    breedsSupported:  BREED_LIST.length,
    timestamp: new Date().toISOString()
  });
});

// ─── Catch-all → serve frontend ───────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3000', 10);

const keyOk = process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here';
if (!keyOk) {
  console.warn('\n⚠️  WARNING: GEMINI_API_KEY not set.');
  console.warn('   → Open  backend/.env  and replace  your_gemini_api_key_here  with your real key.');
  console.warn('   → Get a free key at:  https://aistudio.google.com/app/apikey\n');
} else {
  console.log('✅  Gemini API key loaded.');
}

app.listen(PORT, () => {
  console.log(`🐄  MooID server running → http://localhost:${PORT}`);
  console.log(`🔍  Health check       → http://localhost:${PORT}/api/health`);
});
