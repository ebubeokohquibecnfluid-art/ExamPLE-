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
app.use(cors({
  origin: "*", // Allows all origins for debugging
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

// --- 2. EXPRESS CONFIGURATION ---
app.use(express.json({ limit: "50mb" }));
app.set("trust proxy", 1);

// --- 3. DATABASE ---
let db = null;
getDb().then(d => { db = d; console.log("✅ DB Connected"); }).catch(e => console.error("❌ DB Error:", e));

// --- 4. AI CONFIGURATION ---
const apiKey = (process.env.REAL_GEMINI_KEY || process.env.GEMINI_API_KEY || "").trim();
console.log("🔑 API Key detected:", apiKey ? "YES (Starts with " + apiKey.substring(0, 5) + ")" : "NO");

const genAI = new GoogleGenAI(apiKey);

// --- 5. API ENDPOINTS ---

app.get("/health", (req, res) => res.json({ status: "ok", db: !!db }));

app.post("/api/auth/simple", async (req, res) => {
  const { uid } = req.body;
  if (!uid || !db) return res.status(400).json({ error: "Missing data" });
  try {
    let user = await db.get("SELECT * FROM users WHERE uid = ?", [uid]);
    if (!user) {
      await db.run("INSERT INTO users (uid, credits) VALUES (?, ?)", [uid, 10]);
      user = { uid, credits: 10 };
    }
    res.json(user);
  } catch (err) { res.status(500).json({ error: "Auth failed" }); }
});

// --- THE AI ENDPOINT (WITH LOGGING) ---
app.post("/ask-question", async (req, res) => {
  const { user_id, questionText } = req.body;
  console.log(`📩 New Question from ${user_id}: "${questionText}"`);

  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    if (!apiKey) {
      console.error("❌ ERROR: No API Key found in Environment Variables!");
      res.write(`data: ${JSON.stringify({ text: "Error: API Key missing on server." })}\n\n`);
      return res.end();
    }

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    console.log("🤖 Calling Gemini AI...");

    const result = await model.generateContentStream(questionText);

    let fullText = "";
    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      if (chunkText) {
        fullText += chunkText;
        res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
      }
    }

    console.log("✅ AI Response complete. Length:", fullText.length);
    
    if (db) await db.run("UPDATE users SET credits = MAX(0, credits - 1) WHERE uid = ?", [user_id]);
    
    res.write(`data: [DONE]\n\n`);
    res.end();
  } catch (e) {
    console.error("❌ AI STREAM ERROR:", e);
    res.write(`data: ${JSON.stringify({ text: "Sorry, I'm having trouble connecting to the AI. Please check the server logs." })}\n\n`);
    res.end();
  }
});

app.get("/", (req, res) => res.json({ message: "ExamPLE API is online" }));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
