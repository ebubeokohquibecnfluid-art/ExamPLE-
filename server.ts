import express from "express";
import path from "path";
import fs from "fs";
import axios from "axios";
import { GoogleGenAI, Modality } from "@google/genai";
import { getDb } from "./src/db.js";

const app = express();
const PORT = process.env.PORT || 8080;

// --- 1. EXPRESS CONFIGURATION ---
app.use(express.json({ limit: "50mb" }));
app.set("trust proxy", 1);

// --- 2. DEDICATED HEALTH CHECK ---
// Cloud Run can use this to see if the server is up
app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

// --- 3. SAFE DATABASE INITIALIZATION ---
let db = null;
getDb()
  .then(database => {
    db = database;
    console.log("✅ Database connected");
  })
  .catch(err => {
    console.error("❌ DB Connection Error:", err);
  });

// --- 4. ENVIRONMENT VARIABLES ---
const apiKey = (process.env.REAL_GEMINI_KEY || process.env.GEMINI_API_KEY || "").trim();
const ai = new GoogleGenAI({ apiKey });
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
const PLAN_PRICES = { 'Small': 500, 'Medium': 1000, 'Large': 2000 };

// Helper for credits
const getUserCredits = async (userId) => {
  if (!db) return 10;
  try {
    const user = await db.get("SELECT credits FROM users WHERE uid = ?", [userId]);
    return user ? user.credits : 10;
  } catch (e) { return 10; }
};

// --- 5. API ENDPOINTS ---

app.post("/api/auth/simple", async (req, res) => {
  const { uid } = req.body;
  if (!uid || !db) return res.status(400).json({ error: "Missing data" });
  try {
    const user = await db.get("SELECT * FROM users WHERE uid = ?", [uid]);
    if (!user) await db.run("INSERT INTO users (uid, credits) VALUES (?, ?)", [uid, 10]);
    res.json(await db.get("SELECT * FROM users WHERE uid = ?", [uid]));
  } catch (err) { res.status(500).json({ error: "Auth failed" }); }
});

app.post("/api/payments/initialize", async (req, res) => {
  const { email, amount, userId, planName } = req.body;
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
    await db.run("UPDATE users SET credits = credits + ? WHERE uid = ?", [Number(credits), userId]);
  }
  const distPath = path.join(process.cwd(), "dist");
  res.sendFile(path.join(distPath, "index.html"));
});

app.post("/ask-question", async (req, res) => {
  const { user_id, questionText } = req.body;
  try {
    const credits = await getUserCredits(user_id);
    if (credits < 1) return res.status(403).json({ error: "No credits" });
    res.setHeader('Content-Type', 'text/event-stream');
    const stream = await ai.models.generateContentStream({
      model: "gemini-3.1-flash-lite-preview",
      contents: [{ role: "user", parts: [{ text: questionText }] }],
    });
    for await (const chunk of stream) { if (chunk.text) res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`); }
    if (db) await db.run("UPDATE users SET credits = MAX(0, credits - 1) WHERE uid = ?", [user_id]);
    res.write(`data: [DONE]\n\n`);
    res.end();
  } catch (e) { res.end(); }
});

app.post("/register-school", async (req, res) => {
  const { school_name, password } = req.body;
  if (!school_name || !password || !db) return res.status(400).json({ error: "Missing data" });
  try {
    const school_slug = school_name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const school_id = `sch_${Math.random().toString(36).substring(2, 9)}`;
    const referral_code = Math.random().toString(36).substring(2, 8).toUpperCase();
    await db.run("INSERT INTO schools (school_id, school_name, school_slug, referral_code, password) VALUES (?, ?, ?, ?, ?)", [school_id, school_name, school_slug, referral_code, password]);
    res.json({ school_name, school_id, school_slug, referral_code });
  } catch (err) { res.status(500).json({ error: "Registration failed" }); }
});

app.post("/get-audio", async (req, res) => {
  const { text } = req.body;
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ role: "user", parts: [{ text: `Say this: ${text}` }] }],
      config: { responseModalities: [Modality.AUDIO], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } },
    });
    res.json({ audio: response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data });
  } catch (err) { res.status(500).json({ error: "Audio failed" }); }
});

app.post("/api/whatsapp/message", async (req, res) => {
  const { user_id, user_message } = req.body;
  if (!db) return res.status(500).json({ error: "DB missing" });
  try {
    const message = user_message.trim().toUpperCase();
    if (message.startsWith("JOIN")) {
      const code = message.split(" ")[1];
      const school = await db.get("SELECT * FROM schools WHERE referral_code = ?", [code]);
      if (school) {
        await db.run("UPDATE users SET schoolId = ? WHERE uid = ?", [school.school_id, user_id]);
        return res.json({ message: `Welcome to ExamPLE! Powered by ${school.school_name}.` });
      }
    }
    res.json({ message: "Command not recognized." });
  } catch (err) { res.status(500).json({ error: "WhatsApp failed" }); }
});

// --- 6. PRODUCTION FRONTEND SERVING (Smart UI Handling) ---
const distPath = path.join(process.cwd(), "dist");
app.use(express.static(distPath));

// This handles the root "/" and all other frontend routes
app.get("*", (req, res) => {
  const indexPath = path.join(distPath, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    // Fallback for health checks if the build is missing
    res.status(200).send("ExamPLE API is live 🚀 (App is starting...)");
  }
});

// --- 7. GLOBAL ERROR HANDLING ---
process.on("uncaughtException", (err) => { console.error("Uncaught Exception:", err); });
process.on("unhandledRejection", (err) => { console.error("Unhandled Rejection:", err); });

// --- 8. SERVER START ---
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 ExamPLE running on port ${PORT}`);
});
