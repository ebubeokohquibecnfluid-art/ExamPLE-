import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Modality } from "@google/genai";
import fs from "fs";
import axios from "axios";
import { getDb } from "./src/db.js";

async function startServer() {
  const app = express();
  
  // Port 3000 for AI Studio, process.env.PORT (8080) for Cloud Run
  const PORT = Number(process.env.PORT) || 3000;

  // --- LISTEN IMMEDIATELY ---
  // This ensures the preview shows up and Cloud Run health checks pass instantly.
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server online on port ${PORT}`);
  });

  app.use(express.json({ limit: '50mb' }));
  
  // Trust proxy for production
  app.set('trust proxy', 1);

  const apiKey = (process.env.REAL_GEMINI_KEY || process.env.GEMINI_API_KEY || "").trim();
  
  // --- FIX 3: API Key Safety Check ---
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    console.warn("⚠️ WARNING: Gemini API Key is missing or using placeholder.");
  }
  
  const ai = new GoogleGenAI({ apiKey });
  
  const db = await getDb();

  const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

  const PLAN_PRICES: Record<string, number> = {
    'Small': 500,
    'Medium': 1000,
    'Large': 2000
  };

  // Helper to get user credits
  const getUserCredits = async (userId: string) => {
    const user = await db.get("SELECT credits FROM users WHERE uid = ?", [userId]);
    if (!user) {
      await db.run("INSERT INTO users (uid, credits) VALUES (?, ?)", [userId, 10]);
      return 10;
    }
    return user.credits;
  };

  // ... (Keep all your existing API routes here) ...

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: false
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
}

startServer();
