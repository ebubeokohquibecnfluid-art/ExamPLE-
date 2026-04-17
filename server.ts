import express from "express";
import axios from "axios";
import cors from "cors";
import { GoogleGenAI, Modality } from "@google/genai";
import { getDb } from "./src/db.js";

const app = express();
const PORT = Number(process.env.PORT) || 5000;

// --- 1. CORS CONFIGURATION ---
// Allow requests from Vercel frontend and any configured APP_URL
const allowedOrigins = [
  process.env.APP_URL,
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, etc.) or from allowed origins
    if (!origin) return callback(null, true);
    // Allow any vercel.app domain and any explicitly configured origin
    if (
      origin.endsWith('.vercel.app') ||
      allowedOrigins.includes(origin)
    ) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

// --- 2. DEDICATED HEALTH CHECK ---
app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

// --- 3. EXPRESS CONFIGURATION ---
app.use(express.json({ limit: "50mb" }));
app.set("trust proxy", 1);

// --- 4. SAFE DATABASE INITIALIZATION (Non-blocking) ---
let db: any = null;
getDb()
  .then(database => {
    db = database;
    console.log("✅ Database connected");
  })
  .catch(err => {
    console.error("❌ DB Connection Error:", err);
  });

// --- 5. ENVIRONMENT VARIABLES ---
const apiKey = (process.env.REAL_GEMINI_KEY || process.env.GEMINI_API_KEY || "").trim();
if (!apiKey) {
  console.error("❌ Missing Gemini API Key");
} else {
  console.log(`✅ Gemini API Key loaded (starts with: ${apiKey.substring(0, 6)}...)`);
}

const ai = new GoogleGenAI({ apiKey });
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
const PLAN_PRICES: Record<string, number> = { 'Small': 500, 'Medium': 1000, 'Large': 2000 };

// Helper for credits
const getUserCredits = (userId: string): number => {
  if (!db) return 10;
  try {
    const user = db.prepare("SELECT credits FROM users WHERE uid = ?").get(userId) as any;
    return user ? user.credits : 10;
  } catch (e) { return 10; }
};

// --- 6. API ENDPOINTS ---

app.post("/api/auth/simple", (req, res) => {
  const { uid } = req.body;
  if (!uid || !db) return res.status(400).json({ error: "Missing data" });
  try {
    const user = db.prepare("SELECT * FROM users WHERE uid = ?").get(uid) as any;
    if (!user) db.prepare("INSERT INTO users (uid, credits) VALUES (?, ?)").run(uid, 10);
    res.json(db.prepare("SELECT * FROM users WHERE uid = ?").get(uid));
  } catch (err) { res.status(500).json({ error: "Auth failed" }); }
});

app.post("/api/payments/initialize", async (req, res) => {
  const { email, amount, userId, planName } = req.body;
  const frontendUrl = process.env.APP_URL || process.env.FRONTEND_URL || '';
  // Demo Mode check
  if (PAYSTACK_SECRET === "sk_test_examPLE_demo_key_999") {
    return res.json({ status: true, data: { authorization_url: `${frontendUrl}/payment-success?demo=true&userId=${userId}&credits=${PLAN_PRICES[planName] || 0}` } });
  }
  if (!PAYSTACK_SECRET) return res.status(500).json({ error: "Paystack not configured" });
  try {
    const response = await axios.post("https://api.paystack.co/transaction/initialize", {
      email, amount: amount * 100, metadata: { userId, planName, credits: PLAN_PRICES[planName] || 0 },
      callback_url: `${frontendUrl}/payment-success`
    }, { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } });
    res.json(response.data);
  } catch (err) { res.status(500).json({ error: "Payment failed" }); }
});

app.post("/ask-question", async (req, res) => {
  const { user_id, questionText } = req.body;
  try {
    const credits = getUserCredits(user_id);
    if (credits < 1) return res.status(403).json({ error: "No credits" });
    res.setHeader('Content-Type', 'text/event-stream');
    console.log(`📨 Question from ${user_id}: ${questionText?.substring(0, 50)}`);
    const stream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: questionText }] }],
    });
    let chunkCount = 0;
    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) {
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
        chunkCount++;
      }
    }
    console.log(`✅ Streamed ${chunkCount} chunks for ${user_id}`);
    if (db) db.prepare("UPDATE users SET credits = MAX(0, credits - 1) WHERE uid = ?").run(user_id);
    res.write(`data: [DONE]\n\n`);
    res.end();
  } catch (e: any) {
    console.error("❌ ask-question error:", e?.message || e);
    res.write(`data: [DONE]\n\n`);
    res.end();
  }
});

app.post("/register-school", (req, res) => {
  const { school_name, password } = req.body;
  if (!school_name || !password || !db) return res.status(400).json({ error: "Missing data" });
  try {
    const school_slug = school_name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const school_id = `sch_${Math.random().toString(36).substring(2, 9)}`;
    const referral_code = Math.random().toString(36).substring(2, 8).toUpperCase();
    db.prepare("INSERT INTO schools (school_id, school_name, school_slug, referral_code, password) VALUES (?, ?, ?, ?, ?)").run(school_id, school_name, school_slug, referral_code, password);
    res.json({ school_name, school_id, school_slug, referral_code });
  } catch (err) { res.status(500).json({ error: "Registration failed" }); }
});

app.post("/school-login", (req, res) => {
  const { school_slug, password } = req.body;
  if (!school_slug || !password || !db) return res.status(400).json({ error: "Missing data" });
  try {
    const school = db.prepare("SELECT password FROM schools WHERE school_slug = ?").get(school_slug) as any;
    if (!school) return res.status(404).json({ error: "School not found" });
    if (school.password !== password) return res.status(401).json({ error: "Invalid password" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Login failed" });
  }
});

app.post("/get-audio", async (req, res) => {
  const { text } = req.body;
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ role: "user", parts: [{ text: `Say this clearly: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
      },
    });
    const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audioData) {
      console.error("❌ No audio data returned from TTS model");
      return res.status(500).json({ error: "No audio generated" });
    }
    res.json({ audio: audioData });
  } catch (err: any) {
    console.error("❌ get-audio error:", err?.message || err);
    res.status(500).json({ error: "Audio failed" });
  }
});

app.post("/api/transcribe", async (req, res) => {
  const { audioBase64 } = req.body;
  if (!audioBase64) return res.status(400).json({ error: "No audio provided" });
  try {
    // audioBase64 is a data URL like "data:audio/webm;base64,XXXX"
    const base64Data = audioBase64.includes(',') ? audioBase64.split(',')[1] : audioBase64;
    const mimeType = audioBase64.includes('data:') ? audioBase64.split(';')[0].split(':')[1] : 'audio/webm';
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{
        role: "user",
        parts: [
          { inlineData: { mimeType, data: base64Data } },
          { text: "Transcribe the spoken words in this audio. Return only the transcribed text, nothing else." }
        ]
      }],
    });
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || "";
    console.log(`✅ Transcribed: "${text.substring(0, 60)}"`);
    res.json({ text });
  } catch (err: any) {
    console.error("❌ transcribe error:", err?.message || err);
    res.status(500).json({ error: "Transcription failed" });
  }
});

app.get("/api/schools/by-slug/:slug", (req, res) => {
  const { slug } = req.params;
  if (!db) return res.status(500).json({ error: "DB missing" });
  try {
    const school = db.prepare("SELECT school_id, school_name, school_slug, referral_code, total_students, total_earnings FROM schools WHERE school_slug = ?").get(slug) as any;
    if (!school) return res.status(404).json({ error: "School not found" });
    res.json(school);
  } catch (err) { res.status(500).json({ error: "Failed to fetch school" }); }
});

app.post("/api/whatsapp/message", (req, res) => {
  const { user_id, user_message } = req.body;
  if (!db) return res.status(500).json({ error: "DB missing" });
  try {
    const message = user_message.trim().toUpperCase();
    if (message.startsWith("JOIN")) {
      const code = message.split(" ")[1];
      const school = db.prepare("SELECT * FROM schools WHERE referral_code = ?").get(code) as any;
      if (school) {
        db.prepare("UPDATE users SET schoolId = ? WHERE uid = ?").run(school.school_id, user_id);
        return res.json({ message: `Welcome to ExamPLE! Powered by ${school.school_name}.` });
      }
    }
    res.json({ message: "Command not recognized." });
  } catch (err) { res.status(500).json({ error: "WhatsApp failed" }); }
});

// --- 7. API STATUS ---
app.get("/", (req, res) => {
  res.json({
    message: "ExamPLE API is online",
    status: "ready",
    endpoints: ["/ask-question", "/get-audio", "/register-school", "/api/auth/simple", "/api/payments/initialize"]
  });
});

// --- 8. GLOBAL ERROR HANDLING ---
process.on("uncaughtException", (err) => { console.error("Uncaught Exception:", err); });
process.on("unhandledRejection", (err) => { console.error("Unhandled Rejection:", err); });

// --- 9. SERVER START ---
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 ExamPLE API running on port ${PORT}`);
});
