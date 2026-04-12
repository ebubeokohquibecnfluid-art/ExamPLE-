import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import axios from "axios";
import { getDb } from "./src/db.ts";

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 8080;

  // --- CRITICAL: LISTEN IMMEDIATELY ---
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`App is live and listening on port ${PORT}`);
  });

  app.use(express.json({ limit: '50mb' }));
  app.set('trust proxy', 1);

  // Load DB in background
  let db: any;
  getDb().then(d => { db = d; console.log("DB Ready"); }).catch(e => console.error("DB Error", e));

  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  const ai = new GoogleGenAI({ apiKey });

  app.post("/ask-question", async (req, res) => {
    if (!db) return res.status(503).json({ error: "System starting..." });
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
    } catch (err) { res.status(500).json({ error: "AI Error" }); }
  });

  if (process.env.NODE_ENV === "production") {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
  } else {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  }
}

startServer().catch(err => console.error("Startup Crash:", err));
