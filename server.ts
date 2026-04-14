import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import cors from "cors";
import { GoogleGenAI, Modality } from "@google/genai";
import { getDb } from "./src/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || (IS_PRODUCTION ? 5000 : 3001);

// --- 1. CORS CONFIGURATION ---
app.use(cors());

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
    console.log("✅ Database connected in background");
  })
  .catch(err => {
    console.error("❌ DB Connection Error:", err);
  });

// --- 5. ENVIRONMENT VARIABLES ---
const apiKey = (process.env.REAL_GEMINI_KEY || process.env.GEMINI_API_KEY || "").trim();
if (!apiKey) console.error("❌ Missing Gemini API Key");

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
  // Demo Mode check
  if (PAYSTACK_SECRET === "sk_test_examPLE_demo_key_999") {
    return res.json({ status: true, data: { authorization_url: `${process.env.APP_URL || ''}/payment-success?demo=true&userId=${userId}&credits=${PLAN_PRICES[planName] || 0}` } });
  }
  if (!PAYSTACK_SECRET) return res.status(500).json({ error: "Paystack not configured" });
  try {
    const response = await axios.post("https://api.paystack.co/transaction/initialize", {
      email, amount: amount * 100, metadata: { userId, planName, credits: PLAN_PRICES[planName] || 0 },
      callback_url: `${process.env.APP_URL}/payment-success`
    }, { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } });
    res.json(response.data);
  } catch (err) { res.status(500).json({ error: "Payment failed" }); }
});

app.get("/payment-success", async (req, res) => {
  const { demo, userId, credits } = req.query;
  if (demo === "true" && userId && credits && db) {
    db.prepare("UPDATE users SET credits = credits + ? WHERE uid = ?").run(Number(credits), userId);
  }
  
  const frontendUrl = process.env.APP_URL || 'http://localhost:5000';
  res.redirect(`${frontendUrl}/?payment=success`);
});

app.post("/ask-question", async (req, res) => {
  const { user_id, questionText } = req.body;
  try {
    const credits = getUserCredits(user_id);
    if (credits < 1) return res.status(403).json({ error: "No credits" });
    res.setHeader('Content-Type', 'text/event-stream');
    const stream = await ai.models.generateContentStream({
      model: "gemini-1.5-flash",
      contents: [{ role: "user", parts: [{ text: questionText }] }],
    });
    for await (const chunk of stream) { if (chunk.text) res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`); }
    if (db) db.prepare("UPDATE users SET credits = MAX(0, credits - 1) WHERE uid = ?").run(user_id);
    res.write(`data: [DONE]\n\n`);
    res.end();
  } catch (e) { res.end(); }
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

app.post("/get-audio", async (req, res) => {
  const { text } = req.body;
  try {
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: [{ role: "user", parts: [{ text: `Say this: ${text}` }] }],
      config: { responseModalities: [Modality.AUDIO], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } },
    });
    res.json({ audio: response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data });
  } catch (err) { res.status(500).json({ error: "Audio failed" }); }
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

// --- 7. STATIC FILE SERVING (Production only) ---
if (IS_PRODUCTION) {
  const distPath = path.join(__dirname, 'dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  app.get("/api", (req, res) => {
    res.json({ 
      message: "ExamPLE API is online", 
      status: "ready",
      endpoints: ["/ask-question", "/get-audio", "/register-school", "/school-login"] 
    });
  });
}

// --- 8. GLOBAL ERROR HANDLING ---
process.on("uncaughtException", (err) => { console.error("Uncaught Exception:", err); });
process.on("unhandledRejection", (err) => { console.error("Unhandled Rejection:", err); });

// --- 9. SERVER START (AT THE VERY END) ---
const host = IS_PRODUCTION ? '0.0.0.0' : 'localhost';
app.listen(PORT, host, () => {
  console.log(`🚀 ExamPLE running on port ${PORT}`);
});
