import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Modality } from "@google/genai";
import fs from "fs";
import axios from "axios";
import { getDb } from "./src/db.ts"; // Fixed: Use .ts extension

async function startServer() {
  const app = express();
  
  // --- FIX 1: Use Port 8080 for Cloud Run ---
  const PORT = process.env.PORT || 8080;

  // --- FIX 2: LISTEN IMMEDIATELY ---
  // This tells Google Cloud "I am alive" instantly, passing the health check.
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ ExamPLE Server is awake on port ${PORT}`);
  });

  app.use(express.json({ limit: '50mb' }));
  app.set('trust proxy', 1);

  // Load Database in background
  let db: any;
  getDb().then(d => { 
    db = d; 
    console.log("✅ Database connected"); 
  }).catch(e => console.error("❌ DB Error:", e));

  const apiKey = (process.env.REAL_GEMINI_KEY || process.env.GEMINI_API_KEY || "").trim();
  const ai = new GoogleGenAI({ apiKey });
  const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

  // API Routes
  app.get("/api/health", (req, res) => res.json({ status: "ok", dbReady: !!db }));

  app.post("/ask-question", async (req, res) => {
    if (!db) return res.status(503).json({ error: "Starting up..." });
    const { questionText } = req.body;
    try {
      const model = ai.getGenerativeModel({ model: "gemini-2.0-flash" });
      const result = await model.generateContent(questionText || "Hello");
      res.json({ text: result.response.text() });
    } catch (err) { res.status(500).json({ error: "AI Error" }); }
  });

  // Serve Frontend
  const distPath = path.join(process.cwd(), "dist");
  if (process.env.NODE_ENV === "production") {
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      const indexPath = path.join(distPath, "index.html");
      if (fs.existsSync(indexPath)) res.sendFile(indexPath);
      else res.send("App is starting... please refresh in 30 seconds.");
    });
  } else {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  }
}

startServer().catch(err => {
  console.error("❌ Startup Crash:", err);
  process.exit(1);
});
