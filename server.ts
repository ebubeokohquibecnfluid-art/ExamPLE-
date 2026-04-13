import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Modality } from "@google/genai";
import fs from "fs";
import axios from "axios";
import { getDb } from "./src/db";

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 8080;

  // --- STEP 1: PASS HEALTH CHECK IMMEDIATELY ---
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ ExamPLE Server is awake on port ${PORT}`);
  });

  app.use(express.json({ limit: '50mb' }));
  app.set('trust proxy', 1);

  // Load Database in background
  let db: any;
  getDb().then(d => { db = d; console.log("✅ DB Ready"); }).catch(e => console.error("❌ DB Error", e));

  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  const ai = new GoogleGenAI({ apiKey });
  const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

  const PLAN_PRICES: Record<string, number> = { 'Small': 500, 'Medium': 1000, 'Large': 2000 };

  const getUserCredits = async (userId: string) => {
    if (!db) return 10;
    const user = await db.get("SELECT credits FROM users WHERE uid = ?", [userId]);
    return user ? user.credits : 10;
  };

  app.post("/api/auth/simple", async (req, res) => {
    if (!db) return res.status(503).json({ error: "Starting up..." });
    const { uid } = req.body;
    try {
      const user = await db.get("SELECT * FROM users WHERE uid = ?", [uid]);
      if (!user) await db.run("INSERT INTO users (uid, credits) VALUES (?, ?)", [uid, 10]);
      res.json(await db.get("SELECT * FROM users WHERE uid = ?", [uid]));
    } catch (err) { res.status(500).json({ error: "Auth failed" }); }
  });

  app.post("/api/payments/initialize", async (req, res) => {
    const { email, amount, userId, planName } = req.body;
    if (!PAYSTACK_SECRET) return res.status(500).json({ error: "Paystack not configured" });
    try {
      const response = await axios.post("https://api.paystack.co/transaction/initialize", {
        email, amount: amount * 100, metadata: { userId, planName, credits: PLAN_PRICES[planName] || 0 },
        callback_url: `${process.env.APP_URL || 'http://localhost:8080'}/payment-success`
      }, { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}`, "Content-Type": "application/json" } });
      res.json(response.data);
    } catch (err) { res.status(500).json({ error: "Payment failed" }); }
  });
  app.post("/ask-question", async (req, res) => {
    if (!db) return res.status(503).json({ error: "System warming up..." });
    const { user_id, questionText } = req.body;
    try {
      const model = ai.getGenerativeModel({ model: "gemini-2.0-flash" });
      const result = await model.generateContent(questionText || "Hello");
      res.json({ text: result.response.text() });
    } catch (err) { res.status(500).json({ error: "AI Error" }); }
  });

  app.post("/api/whatsapp/message", async (req, res) => {
    const { user_id, user_message } = req.body;
    if (!db) return res.status(503).end();
    try {
      const message = user_message.trim().toUpperCase();
      if (message.startsWith("JOIN")) {
        const code = message.split(" ")[1];
        const school = await db.get("SELECT * FROM schools WHERE referral_code = ?", [code]);
        if (school) {
          await db.run("UPDATE users SET schoolId = ? WHERE uid = ?", [school.school_id, user_id]);
          return res.json({ message: `Welcome to ExamPLE! Powered by ${school.school_name}.` });
        }
      }
      res.json({ message: "Command not recognized." });
    } catch (err) { res.status(500).end(); }
  });

  if (process.env.NODE_ENV === "production") {
    const distPath = path.join(process.cwd(), "dist");
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

startServer().catch(err => console.error("Startup Crash:", err));
