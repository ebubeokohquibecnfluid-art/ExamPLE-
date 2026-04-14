import express from "express";
import path from "path";
import fs from "fs";
import axios from "axios";
import cors from "cors";
import { GoogleGenAI, Modality } from "@google/genai";
import { getDb } from "./src/db.js";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// --- 1. CORS CONFIGURATION ---
app.use(cors());

// --- 2. DEDICATED HEALTH CHECK ---
app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

// --- 3. EXPRESS CONFIGURATION ---
app.use(express.json({ limit: "50mb" }));
app.set("trust proxy", 1);

// --- 4. SAFE DATABASE INITIALIZATION ---
let db = null;
getDb()
  .then(database => {
    db = database;
    console.log("✅ Database connected");
  })
  .catch(err => {
    console.error("❌ DB Error:", err);
  });

// --- 5. ENVIRONMENT VARIABLES ---
const apiKey = (process.env.REAL_GEMINI_KEY || process.env.GEMINI_API_KEY || "").trim();
const ai = new GoogleGenAI(apiKey);
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

// --- 6. API ENDPOINTS ---

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
  const frontendUrl = process.env.APP_URL || 'https://exam-ple.vercel.app';
  res.redirect(`${frontendUrl}/?payment=success`);
});

// --- FIXED AI ENDPOINT ---
app.post("/ask-question", async (req, res) => {
  const { user_id, questionText } = req.body;
  try {
    const credits = await getUserCredits(user_id);
    if (credits < 1) return res.status(403).json({ error: "No credits" });

    res.setHeader('Content-Type', 'text/event-stream');
    
    // Correct SDK usage
    const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContentStream(questionText);

    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      if (chunkText) {
        res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
      }
    }

    if (db) await db.run("UPDATE users SET credits = MAX(0, credits - 1) WHERE uid = ?", [user_id]);
    res.write(`data: [DONE]\n\n`);
    res.end();
  } catch (e) {
    console.error("AI Error:", e);
    res.end();
  }
});

app.post("/get-audio", async (req, res) => {
  const { text } = req.body;
  try {
    const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
    const response = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: `Say this: ${text}` }] }],
      generationConfig: { responseModalities: ["AUDIO"] as any }
    });
    res.json({ audio: response.response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data });
  } catch (err) { 
    console.error("Audio Error:", err);
    res.status(500).json({ error: "Audio failed" }); 
  }
});

app.get("/", (req, res) => {
  res.json({ message: "ExamPLE API is online", status: "ready" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 API running on port ${PORT}`);
});
