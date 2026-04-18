import express from "express";
import path from "path";
import fs from "fs";
import axios from "axios";
import cors from "cors";
import { GoogleGenAI, Modality } from "@google/genai";
import { TextToSpeechClient } from "@google-cloud/text-to-speech";
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
    console.log("✅ Database connected in background");
    
    // Ensure schema is up to date
    db.run("ALTER TABLE users ADD COLUMN expiry_date TEXT").catch(() => {});
    db.run("ALTER TABLE schools ADD COLUMN total_earnings REAL DEFAULT 0").catch(() => {});
  })
  .catch(err => {
    console.error("❌ DB Connection Error:", err);
  });

// --- 5. ENVIRONMENT VARIABLES & CLIENTS ---
const apiKey = (process.env.REAL_GEMINI_KEY || process.env.GEMINI_API_KEY || "").trim();
const ai = new GoogleGenAI({ apiKey });
const ttsClient = new TextToSpeechClient();

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
const PLAN_PRICES = { 'Basic': 2500, 'Premium': 4500, 'Max': 6500, 'Top-up': 500 };
const PLAN_UNITS = { 'Basic': 50, 'Premium': 100, 'Max': 250, 'Top-up': 10 };

// Helper for credits
const getUserCredits = async (userId) => {
  if (!db) return 10;
  try {
    const user = await db.get("SELECT credits, expiry_date FROM users WHERE uid = ?", [userId]);
    if (!user) return 10;
    
    if (user.expiry_date) {
      const expiry = new Date(user.expiry_date);
      if (expiry < new Date()) {
        await db.run("UPDATE users SET credits = 0, expiry_date = NULL WHERE uid = ?", [userId]);
        return 0;
      }
    }
    return user.credits;
  } catch (e) { return 10; }
};

// --- 6. API ENDPOINTS ---

app.post("/get-audio", async (req, res) => {
  const { text, user_id } = req.body;
  try {
    // Credit Check
    if (user_id && db) {
      const credits = await getUserCredits(user_id);
      if (credits < 1) return res.status(403).json({ error: "Not enough credits for audio" });
      await db.run("UPDATE users SET credits = MAX(0, credits - 1) WHERE uid = ?", [user_id]);
    }
    
    try {
      // PRIMARY: Nigerian Voice (Google Cloud TTS)
      const [response] = await ttsClient.synthesizeSpeech({
        input: { text },
        voice: { languageCode: 'en-NG', name: 'en-NG-Wavenet-A' },
        audioConfig: { audioEncoding: 'MP3' },
      });
      if (response.audioContent) {
        return res.json({ 
          audio: Buffer.from(response.audioContent).toString('base64'),
          voice: 'en-NG-Wavenet-A',
          mimeType: 'audio/mpeg'
        });
      }
    } catch (ttsErr) {
      console.warn("Cloud TTS failed, falling back to Gemini:", ttsErr);
    }

    // FALLBACK: Nigerian Persona (Gemini TTS)
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ 
        parts: [{ text: `Say this exactly, but use a friendly, professional Nigerian teacher accent: ${text}` }] 
      }],
      config: { 
        responseModalities: [Modality.AUDIO], 
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } 
      },
    });
    res.json({ 
      audio: response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data,
      voice: 'gemini-tts-fallback',
      mimeType: 'audio/pcm'
    });
  } catch (err) { res.status(500).json({ error: "Audio failed" }); }
});

app.post("/api/whatsapp/message", async (req, res) => {
  const { user_id, user_message } = req.body;
  if (!db) return res.status(500).json({ error: "DB missing" });
  try {
    const messageUpper = user_message.trim().toUpperCase();
    if (messageUpper.startsWith("JOIN")) {
      const searchTerm = user_message.trim().substring(4).trim();
      
      // SEARCH: Referral Code -> School Name -> URL Slug
      let school = await db.get("SELECT * FROM schools WHERE referral_code = ?", [searchTerm.toUpperCase()]);
      if (!school) school = await db.get("SELECT * FROM schools WHERE school_name = ?", [searchTerm]);
      if (!school) {
        const slug = searchTerm.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        school = await db.get("SELECT * FROM schools WHERE school_slug = ?", [slug]);
      }

      if (school) {
        await db.run("UPDATE users SET schoolId = ? WHERE uid = ?", [school.school_id, user_id]);
        return res.json({ message: `Welcome to ExamPLE! Powered by ${school.school_name} 🏫` });
      }
    }
    res.json({ message: "Command not recognized. Please type JOIN followed by your school code or name." });
  } catch (err) { res.status(500).json({ error: "WhatsApp failed" }); }
});

app.post("/api/payments/initialize", async (req, res) => {
  const { email, amount, userId, planName } = req.body;
  const credits = PLAN_UNITS[planName] || 0;
  
  if (PAYSTACK_SECRET === "sk_test_examPLE_demo_key_999") {
    return res.json({ status: true, data: { authorization_url: `${process.env.APP_URL || ''}/payment-success?demo=true&userId=${userId}&credits=${credits}&amount=${amount}` } });
  }
  
  try {
    const response = await axios.post("https://api.paystack.co/transaction/initialize", {
      email, amount: amount * 100, metadata: { userId, planName, credits },
      callback_url: `${process.env.APP_URL}/payment-success`
    }, { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } });
    res.json(response.data);
  } catch (err) { res.status(500).json({ error: "Payment failed" }); }
});

app.get("/payment-success", async (req, res) => {
  const { demo, userId, credits, amount } = req.query;
  const creditAmount = Number(credits);
  const payAmount = Number(amount);
  
  if (demo === "true" && userId && creditAmount && db) {
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 30);
    await db.run("UPDATE users SET credits = credits + ?, expiry_date = ? WHERE uid = ?", [creditAmount, expiry.toISOString(), userId]);
    
    // REVENUE SHARE (40%)
    const user = await db.get("SELECT schoolId FROM users WHERE uid = ?", [userId]);
    if (user?.schoolId) {
      const schoolComm = payAmount * 0.4;
      await db.run("UPDATE schools SET total_earnings = total_earnings + ? WHERE school_id = ?", [schoolComm, user.schoolId]);
    }
  }
  res.sendFile(path.join(path.join(process.cwd(), "dist"), "index.html"));
});

app.post("/ask-question", async (req, res) => {
  const { user_id, questionText, isVoice } = req.body;
  const cost = isVoice ? 2 : 1;
  try {
    const credits = await getUserCredits(user_id);
    if (credits < cost) return res.status(403).json({ error: "Not enough credits" });
    res.setHeader('Content-Type', 'text/event-stream');
    const stream = await ai.models.generateContentStream({
      model: "gemini-3.1-flash-lite-preview",
      contents: [{ role: "user", parts: [{ text: questionText }] }],
    });
    for await (const chunk of stream) { if (chunk.text) res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`); }
    if (db) await db.run("UPDATE users SET credits = MAX(0, credits - ?) WHERE uid = ?", [cost, user_id]);
    res.write(`data: [DONE]\n\n`);
    res.end();
  } catch (e) { res.end(); }
});

app.post("/register-school", async (req, res) => {
  const { school_name, password } = req.body;
  const school_slug = school_name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const school_id = `sch_${Math.random().toString(36).substring(2, 9)}`;
  const referral_code = Math.random().toString(36).substring(2, 8).toUpperCase();
  await db.run("INSERT INTO schools (school_id, school_name, school_slug, referral_code, password) VALUES (?, ?, ?, ?, ?)", [school_id, school_name, school_slug, referral_code, password]);
  res.json({ school_name, school_id, school_slug, referral_code });
});

app.get("/api/schools/by-slug/:slug", async (req, res) => {
  const school = await db.get("SELECT * FROM schools WHERE school_slug = ?", [req.params.slug]);
  if (school) res.json(school); else res.status(404).json({ error: "Not found" });
});

app.post("/school-login", async (req, res) => {
  const { school_slug, password } = req.body;
  const school = await db.get("SELECT * FROM schools WHERE school_slug = ?", [school_slug]);
  if (school && school.password === password) res.json({ success: true });
  else res.status(401).json({ error: "Invalid password" });
});

app.post("/school-dashboard", async (req, res) => {
  const school = await db.get("SELECT * FROM schools WHERE school_slug = ?", [req.body.school_slug]);
  if (!school) return res.status(404).json({ error: "Not found" });
  const withdrawals = await db.all("SELECT * FROM withdrawals WHERE school_id = ?", [school.school_id]);
  const usersRes = await db.get("SELECT COUNT(*) as count FROM users WHERE schoolId = ?", [school.school_id]);
  res.json({ ...school, total_students: school.total_students || 0, active_users: usersRes?.count || 0, withdrawals });
});

app.post("/request-withdrawal", async (req, res) => {
  const { school_id, amount } = req.body;
  const school = await db.get("SELECT total_earnings FROM schools WHERE school_id = ?", [school_id]);
  if (!school || school.total_earnings < amount) return res.status(400).json({ error: "Insufficient balance" });
  const withdrawal_id = `wd_${Math.random().toString(36).substring(2, 9)}`;
  await db.run("INSERT INTO withdrawals (id, school_id, amount, status, timestamp) VALUES (?, ?, ?, ?, ?)", [withdrawal_id, school_id, amount, 'pending', new Date().toISOString()]);
  await db.run("UPDATE schools SET total_earnings = total_earnings - ? WHERE school_id = ?", [amount, school_id]);
  res.json({ message: "Withdrawal submitted" });
});

// --- 7. MISC ---
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 ExamPLE running on port ${PORT}`);
});
