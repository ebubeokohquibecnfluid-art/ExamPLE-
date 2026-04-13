import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import axios from "axios";
import { getDb } from "./src/db.ts";

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 8080;

  // --- STEP 1: PASS THE HEALTH CHECK IMMEDIATELY ---
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ App is live and listening on port ${PORT}`);
  });

  app.use(express.json({ limit: '50mb' }));
  app.set('trust proxy', 1);

  // --- STEP 2: LOAD DATABASE IN BACKGROUND ---
  let db: any;
  getDb().then(database => {
    db = database;
    console.log("✅ Database connected");
  }).catch(err => {
    console.error("❌ Database failed to load, but app is still running:", err);
  });

  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  const ai = new GoogleGenAI({ apiKey });

  app.post("/ask-question", async (req, res) => {
    if (!db) return res.status(503).json({ error: "Database is still waking up... please try again in 5 seconds." });
    const { questionText } = req.body;
    try {
      const model = ai.getGenerativeModel({ model: "gemini-2.0-flash" });
      const result = await model.generateContentStream([{ text: questionText }]);
      res.setHeader('Content-Type', 'text/event-stream');
      for await (const chunk of result.stream) {
        res.write(`data: ${JSON.stringify({ text: chunk.text() })}\n\n`);
      }
      res.write(`data: [DONE]\n\n`);
      res.end();
    } catch (err) {
      res.status(500).json({ error: "AI Teacher is busy" });
    }
  });

  // Serve static files in production
  if (process.env.NODE_ENV === "production") {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
  } else {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  }
}

startServer().catch(err => {
  console.error("❌ CRITICAL STARTUP ERROR:", err);
});
