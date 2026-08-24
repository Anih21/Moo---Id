const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Load environment variables from a local .env file in the backend directory
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split(/\r?\n/).forEach(line => {
      // Ignore comments and empty lines
      if (line.trim() && !line.trim().startsWith('#')) {
        const parts = line.split('=');
        if (parts.length > 1) {
          const key = parts[0].trim();
          const value = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
          process.env[key] = value;
        }
      }
    });
  }
} catch (e) {
  console.error("Error loading .env file:", e);
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../frontend')));

// Helper to extract raw base64 and mime type from base64 data URL
function parseBase64Image(dataUrl) {
  const matches = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (matches && matches.length === 3) {
    return {
      mimeType: matches[1],
      data: matches[2]
    };
  }
  // Fallback if it is already a raw base64 string
  return {
    mimeType: 'image/jpeg',
    data: dataUrl
  };
}

app.post('/api/identify', async (req, res) => {
  try {
    const { images } = req.body;
    if (!images || !Array.isArray(images) || images.length !== 4) {
      return res.status(400).json({ error: "Please upload exactly 4 images." });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ 
        error: "Server error: GEMINI_API_KEY is not configured on the server. Please add your API key to the .env file in the backend folder." 
      });
    }

    console.log("Cattle identification request received. Forwarding to Gemini API...");

    // Construct parts array with prompt and images
    const promptText = `You are an expert zoologist and cattle breed classifier. 
Analyze the 4 uploaded photos of an animal from different angles (Front, Back, Left Side, Right Side).
Your task is to identify if the animal is a cow, bull, or buffalo, and determine its breed.

You MUST choose the breed name from this exact list:
[Gir, Sahiwal, Murrah Buffalo, Tharparkar, Kankrej, Ongole, Hariana, Rathi, Deoni, Hallikar, Punganur, Red Kandhari, Nimari, Holstein-Friesian, Jersey, Angus, Brahman, Simmental, Limousin, Red Sindhi]

Guidelines:
1. If the photos do not clearly show a cow, bull, or buffalo, set success to false and write a helpful error message.
2. If the animal is recognized but does not belong to any of the breeds in the list above, set success to false and write a helpful error message stating that the breed is not supported in the database.
3. If the animal is successfully identified as one of the breeds in the list, set success to true, set breedName to the exact name from the list (match spelling and casing exactly), and set confidence to an integer between 75 and 98 representing your confidence level.`;

    const parts = [{ text: promptText }];

    for (let i = 0; i < images.length; i++) {
      const parsed = parseBase64Image(images[i]);
      parts.push({
        inlineData: {
          mimeType: parsed.mimeType,
          data: parsed.data
        }
      });
    }

    // Payload specifying response schema to ensure structured JSON output
    const payload = {
      contents: [{
        parts: parts
      }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            success: { type: "BOOLEAN" },
            breedName: { type: "STRING" },
            confidence: { type: "INTEGER" },
            error: { type: "STRING" }
          },
          required: ["success", "breedName", "confidence", "error"]
        }
      }
    };

    const model = 'gemini-2.5-flash';
    const apiURL = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const apiResponse = await fetch(apiURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!apiResponse.ok) {
      const errText = await apiResponse.text();
      console.error("Gemini API Error Response:", errText);
      return res.status(500).json({ error: `Gemini API error: ${apiResponse.statusText}` });
    }

    const apiData = await apiResponse.json();

    if (!apiData.candidates || apiData.candidates.length === 0) {
      return res.status(500).json({ error: "Gemini did not return any classification candidates. Please try again." });
    }

    const textResult = apiData.candidates[0].content.parts[0].text;
    const jsonResult = JSON.parse(textResult);

    console.log("Gemini API Response parsed successfully:", jsonResult);

    if (jsonResult.success) {
      return res.json({
        breedName: jsonResult.breedName,
        confidence: `${jsonResult.confidence}%`
      });
    } else {
      return res.status(400).json({
        error: jsonResult.error || "Unrecognized animal/object or unsupported breed."
      });
    }

  } catch (err) {
    console.error("Error in /api/identify:", err);
    res.status(500).json({ error: "Internal server error during analysis: " + err.message });
  }
});

const PORT = process.env.PORT || 3000;

if (!process.env.GEMINI_API_KEY) {
  console.warn("⚠️ WARNING: GEMINI_API_KEY is not defined. Please create a '.env' file in the 'backend' folder and set GEMINI_API_KEY=your_api_key.");
} else {
  console.log("🔑 Gemini API Key loaded successfully.");
}

app.listen(PORT, () => {
  console.log(`MooID server listening on http://localhost:${PORT}`);
});
