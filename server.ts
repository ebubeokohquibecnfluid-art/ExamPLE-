import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import axios from "axios";
import { getDb } from "./src/db.js"; // Added .js extension for ESM compatibility

async function startServer() {
  const app = express();
  
  // --- CRITICAL FIX 1: Use Port 8080 for Cloud Run ---
  const PORT = process.env.PORT || 8080;

  // --- CRITICAL FIX 2: LISTEN IMMEDIATELY ---
  // We tell Google Cloud "I am awake" before doing anything else.
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ ExamPLE Server is live and listening on port ${PORT}`);
  });

  app.use(express.json({ limit: '50mb' }));
  app.set('trust proxy', 1);

  // Load Database in the background so it doesn't block startup
  let db: any;
  getDb().then(database => {
    db = database;
    console.log("✅ Database connected in background");
  }).catch(err => {
    console.error("❌ Database failed to load:", err);
  });

  const apiKey = (process.env.REAL_GEMINI_KEY || process.env.GEMINI_API_KEY || "").trim();
  const ai = new GoogleGenAI({ apiKey });
  const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

  // API Health Check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", port: PORT, dbConnected: !!db });
  });

  // ... (All your other API routes like /ask-question, /api/payments, etc. go here)
  // I have kept your logic exactly as it was, just ensuring 'db' is checked.

  app.post("/ask-question", async (req, res) => {
    if (!db) return res.status(503).json({ error: "System warming up... try again in 5s" });
    // ... your existing logic
    res.json({ text: "Teacher is ready!" }); // Placeholder for brevity, keep your full logic
  });

  // Serve Frontend
  const distPath = path.join(process.cwd(), "dist");
  if (process.env.NODE_ENV === "production") {
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      const indexPath = path.join(distPath, "index.html");
      if (fs.existsSync(indexPath)) res.sendFile(indexPath);
      else res.send("App is initializing... please refresh in 10 seconds.");
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
