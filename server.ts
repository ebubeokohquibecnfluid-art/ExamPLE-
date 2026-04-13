import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Modality } from "@google/genai";
import fs from "fs";
import axios from "axios";
import { getDb } from "./src/db.ts";

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 8080;

  // --- STEP 1: PASS HEALTH CHECK IMMEDIATELY ---
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ ExamPLE Server is awake on port ${PORT}`);
  });

  app.use(express.json({ limit: '50mb' }));
  app.set('trust proxy', 1);

  // --- STEP 2: LOAD DATABASE IN BACKGROUND ---
  let db: any;
  getDb().then(d => { 
    db = d; 
    console.log("✅ Database initialized"); 
  }).catch(e => console.error("❌ Database error:", e));

  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  const ai = new GoogleGenAI({ apiKey });
  const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

  const PLAN_PRICES: Record<string, number> = {
    "Basic": 10,
    "Standard": 30,
    "Premium": 100
  };

  async function getUserCredits(uid: string): Promise<number> {
    if (!db) return 0;
    const user = await db.get("SELECT credits FROM users WHERE uid = ?", [uid]);
    return user ? user.credits : 0;
  }

  app.post("/api/auth/sync", async (req, res) => {
    const { uid } = req.body;
    if (!db) return res.status(503).json({ error: "Starting up..." });
    try {
      const user = await db.get("SELECT * FROM users WHERE uid = ?", [uid]);
      if (!user) {
        await db.run("INSERT INTO users (uid, credits) VALUES (?, ?)", [uid, 10]);
      }
      const updatedUser = await db.get("SELECT * FROM users WHERE uid = ?", [uid]);
      res.json(updatedUser);
    } catch (err) {
      res.status(500).json({ error: "Auth failed" });
    }
  });

  app.post("/api/payments/initialize", async (req, res) => {
    const { email, amount, userId, planName } = req.body;
    if (!PAYSTACK_SECRET) return res.status(500).json({ error: "Paystack not configured" });
    try {
      const response = await axios.post(
        "https://api.paystack.co/transaction/initialize",
        {
          email,
          amount: amount * 100,
          metadata: { userId, planName, credits: PLAN_PRICES[planName] || 0 },
          callback_url: `${process.env.APP_URL || 'http://localhost:8080'}/payment-success`
        },
        { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}`, "Content-Type": "application/json" } }
      );
      res.json(response.data);
    } catch (err: any) {
      res.status(500).json({ error: "Payment init failed" });
    }
  });

  app.post("/api/payments/webhook", async (req, res) => {
    const event = req.body;
    if (event.event === "charge.success" && db) {
      const { metadata } = event.data;
      await db.run("UPDATE users SET credits = credits + ? WHERE uid = ?", [metadata.credits, metadata.userId]);
    }
    res.sendStatus(200);
  });

  app.post("/ask-question", async (req, res) => {
    if (!db) return res.status(503).json({ error: "System warming up... try in 5s" });
    const { user_id, level, subject, questionText, usePidgin, imageBase64, school_id } = req.body;
    try {
      const currentCreditsVal = await getUserCredits(user_id);
      if (currentCreditsVal < 1) return res.status(403).json({ error: "No credits left" });

      const model = ai.getGenerativeModel({ model: "gemini-2.0-flash" });
      const promptParts: any[] = [`Level: ${level}`, `Subject: ${subject}`, `Question: ${questionText}`];
      if (imageBase64) promptParts.push({ inlineData: { data: imageBase64.split(',')[1] || imageBase64, mimeType: "image/jpeg" } });

      res.setHeader('Content-Type', 'text/event-stream');
      const result = await model.generateContentStream(promptParts);
      for await (const chunk of result.stream) {
        res.write(`data: ${JSON.stringify({ text: chunk.text() })}\n\n`);
      }
      await db.run("UPDATE users SET credits = MAX(0, credits - 1) WHERE uid = ?", [user_id]);
      res.write(`data: [DONE]\n\n`);
      res.end();
    } catch (err) { res.status(500).end(); }
  });

  app.post("/register-school", async (req, res) => {
    const { school_name, password } = req.body;
    if (!db) return res.status(503).end();
    try {
      const school_slug = school_name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const school_id = `sch_${Math.random().toString(36).substring(2, 9)}`;
      const referral_code = Math.random().toString(36).substring(2, 8).toUpperCase();
      await db.run("INSERT INTO schools (school_id, school_name, school_slug, referral_code, password) VALUES (?, ?, ?, ?, ?)", [school_id, school_name, school_slug, referral_code, password]);
      res.json({ school_name, school_id, school_slug, referral_code });
    } catch (err) { res.status(500).json({ error: "Name taken" }); }
  });
  app.post("/school-login", async (req, res) => {
    const { school_slug, password } = req.body;
    if (!db) return res.status(503).end();
    const school = await db.get("SELECT * FROM schools WHERE school_slug = ? AND password = ?", [school_slug, password]);
    if (school) res.json({ success: true, school_id: school.school_id, school_name: school.school_name });
    else res.status(401).json({ error: "Invalid login" });
  });

  app.get("/check-credits", async (req, res) => {
    const { user_id } = req.query;
    const credits = await getUserCredits(user_id as string);
    res.json({ credits });
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
      res.json({ message: "Command not recognized. Try 'JOIN [CODE]'" });
    } catch (err) { res.status(500).end(); }
  });

  // Admin Logic
  const ADMIN_SECRET = "exam-admin-2026";
  app.get("/admin/stats", async (req, res) => {
    if (req.headers.authorization !== `Bearer ${ADMIN_SECRET}`) return res.status(401).end();
    const users = (await db.get("SELECT COUNT(*) as c FROM users")).c;
    const schools = (await db.get("SELECT COUNT(*) as c FROM schools")).c;
    res.json({ totalUsers: users, totalSchools: schools });
  });

  // Serve Frontend
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
