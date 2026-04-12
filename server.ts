import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Modality } from "@google/genai";
import fs from "fs";
import axios from "axios";
import { getDb } from "./src/db.ts";

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 8080; // Default to 8080 for Cloud Run

  // --- FAST START TRICK ---
  // Start listening immediately so Google Cloud knows we are awake
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is awake and listening on port ${PORT}`);
  });

  // Load database in the background
  let db: any;
  getDb().then(database => {
    db = database;
    console.log("Database is ready!");
  }).catch(err => {
    console.error("Database failed to load:", err);
  });

  app.use(express.json({ limit: '50mb' }));
  app.set('trust proxy', 1);

  const apiKey = (process.env.REAL_GEMINI_KEY || process.env.GEMINI_API_KEY || "").trim();
  const ai = new GoogleGenAI({ apiKey });
  const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

  // Helper to get user credits
  const getUserCredits = async (userId: string) => {
    if (!db) throw new Error("Database not ready");
    const user = await db.get("SELECT credits FROM users WHERE uid = ?", [userId]);
    if (!user) {
      await db.run("INSERT INTO users (uid, credits) VALUES (?, ?)", [userId, 10]);
      return 10;
    }
    return user.credits;
  };

  app.post("/api/auth/simple", async (req, res) => {
    if (!db) return res.status(503).json({ error: "Database starting..." });
    const { uid } = req.body;
    try {
      const user = await db.get("SELECT * FROM users WHERE uid = ?", [uid]);
      if (!user) await db.run("INSERT INTO users (uid, credits) VALUES (?, ?)", [uid, 10]);
      const profile = await db.get("SELECT * FROM users WHERE uid = ?", [uid]);
      res.json(profile);
    } catch (err) { res.status(500).json({ error: "Auth failed" }); }
  });

  app.post("/ask-question", async (req, res) => {
    if (!db) return res.status(503).json({ error: "Database starting..." });
    const { user_id, level, subject, questionText, usePidgin, imageBase64, school_id } = req.body;
    try {
      const credits = await getUserCredits(user_id);
      if (credits < 1) return res.status(403).json({ error: "Insufficient credits" });

      const model = ai.getGenerativeModel({ model: "gemini-2.0-flash" });
      let prompt = `You are a professional Nigerian teacher for ${level} students. Subject: ${subject}. Language: ${usePidgin ? "Pidgin" : "English"}. Question: ${questionText}`;
      
      const result = await model.generateContentStream([{ text: prompt }]);
      res.setHeader('Content-Type', 'text/event-stream');
      for await (const chunk of result.stream) {
        res.write(`data: ${JSON.stringify({ text: chunk.text() })}\n\n`);
      }
      await db.run("UPDATE users SET credits = credits - 1 WHERE uid = ?", [user_id]);
      res.write(`data: [DONE]\n\n`);
      res.end();
    } catch (err) { res.status(500).json({ error: "Teacher is busy" }); }
  });

  // Vite / Static Files
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true, hmr: false }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
  }
}

startServer().catch(err => {
  console.error("CRITICAL STARTUP ERROR:", err);
});
