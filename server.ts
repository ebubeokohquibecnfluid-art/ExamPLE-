import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Modality } from "@google/genai";
import fs from "fs";
import axios from "axios";
import { getDb } from "./src/db.ts"; // Added .ts here

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 8080;
  const db = await getDb();

  app.use(express.json({ limit: '50mb' }));
  app.set('trust proxy', 1);

  const apiKey = (process.env.REAL_GEMINI_KEY || process.env.GEMINI_API_KEY || "").trim();
  const ai = new GoogleGenAI({ apiKey });

  app.post("/ask-question", async (req, res) => {
    const { user_id, questionText } = req.body;
    try {
      const model = ai.getGenerativeModel({ model: "gemini-2.0-flash" });
      const result = await model.generateContentStream([{ text: questionText }]);
      res.setHeader('Content-Type', 'text/event-stream');
      for await (const chunk of result.stream) {
        res.write(`data: ${JSON.stringify({ text: chunk.text() })}\n\n`);
      }
      res.write(`data: [DONE]\n\n`);
      res.end();
    } catch (err) { res.status(500).json({ error: "Teacher is busy" }); }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true, hmr: false }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}
startServer();
