import express from "express";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 8080;

  // --- STEP 1: TELL GOOGLE CLOUD WE ARE ALIVE IMMEDIATELY ---
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ App is live on port ${PORT}`);
  });

  app.use(express.json({ limit: '50mb' }));

  // --- STEP 2: DATABASE SETUP (IN-MEMORY FOR SPEED) ---
  let db: any;
  try {
    db = await open({
      filename: '/tmp/database.sqlite',
      driver: sqlite3.Database
    });
    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (uid TEXT PRIMARY KEY, credits INTEGER DEFAULT 10);
      CREATE TABLE IF NOT EXISTS schools (school_id TEXT PRIMARY KEY, school_name TEXT, referral_code TEXT);
    `);
    console.log("✅ DB Ready");
  } catch (e) {
    console.error("❌ DB Error:", e);
  }

  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  const ai = new GoogleGenAI({ apiKey });

  // Simple API for testing
  app.get("/api/health", (req, res) => res.json({ status: "ok" }));

  app.post("/ask-question", async (req, res) => {
    const { questionText } = req.body;
    try {
      const model = ai.getGenerativeModel({ model: "gemini-2.0-flash" });
      const result = await model.generateContent(questionText || "Hello");
      res.json({ text: result.response.text() });
    } catch (err) {
      res.status(500).json({ error: "AI Error" });
    }
  });

  // --- STEP 3: SERVE THE FRONTEND ---
  const distPath = path.join(process.cwd(), "dist");
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
  } else {
    app.get("*", (req, res) => res.send("App is starting... please refresh in 30 seconds."));
  }
}

import fs from "fs";
startServer().catch(err => console.error("Startup Crash:", err));
