import express from "express";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from "fs";

async function startServer() {
  const app = express();
  // --- FIX: Use the Port Google Cloud provides ---
  const PORT = process.env.PORT || 8080;

  app.use(express.json({ limit: '50mb' }));

  // --- FIX: Use /tmp for the database in production ---
  const dbPath = process.env.NODE_ENV === 'production' ? '/tmp/database.sqlite' : './database.sqlite';
  
  let db: any;
  try {
    db = await open({ filename: dbPath, driver: sqlite3.Database });
    await db.exec(`CREATE TABLE IF NOT EXISTS users (uid TEXT PRIMARY KEY, credits INTEGER DEFAULT 10)`);
    console.log("✅ Database Ready");
  } catch (e) {
    console.error("❌ Database Error:", e);
  }

  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  const ai = new GoogleGenAI({ apiKey });

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

  // --- FIX: Serve the built frontend ---
  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath));
  app.get("*", (req, res) => {
    if (fs.existsSync(path.join(distPath, "index.html"))) {
      res.sendFile(path.join(distPath, "index.html"));
    } else {
      res.send("App is building... please refresh in 1 minute.");
    }
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Server is live on port ${PORT}`);
  });
}

startServer().catch(err => console.error("Startup Crash:", err));
