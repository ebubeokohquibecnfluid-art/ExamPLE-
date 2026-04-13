import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Modality } from "@google/genai";
import fs from "fs";
import axios from "axios";
import { getDb } from "./src/db.js";

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

  const apiKey = (process.env.REAL_GEMINI_KEY || process.env.GEMINI_API_KEY || "").trim();
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
  app.post("/api/payments/webhook", async (req, res) => {
    const event = req.body;
    if (event.event === "charge.success" && db) {
      const { metadata } = event.data;
      try {
        await db.run("UPDATE users SET credits = credits + ? WHERE uid = ?", [metadata.credits, metadata.userId]);
      } catch (err) { console.error("Webhook DB Error", err); }
    }
    res.sendStatus(200);
  });

  app.post("/api/transcribe", async (req, res) => {
    if (!db) return res.status(503).end();
    const { audioBase64 } = req.body;
    try {
      const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
      const result = await model.generateContent([
        { inlineData: { data: audioBase64.split(',')[1] || audioBase64, mimeType: "audio/webm" } },
        { text: "Transcribe this audio exactly." }
      ]);
      res.json({ text: result.response.text() });
    } catch (err) { res.status(500).json({ error: "Transcription failed" }); }
  });

  app.post("/ask-question", async (req, res) => {
    if (!db) return res.status(503).json({ error: "System warming up..." });
    const { user_id, level, subject, questionText, imageBase64 } = req.body;
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
    } catch (err) { res.status(500).json({ error: "Registration failed" }); }
  });

  app.post("/school-login", async (req, res) => {
    const { school_slug, password } = req.body;
    if (!db) return res.status(503).end();
    const school = await db.get("SELECT * FROM schools WHERE school_slug = ? AND password = ?", [school_slug, password]);
    if (school) res.json({ success: true, school_id: school.school_id, school_name: school.school_name });
    else res.status(401).json({ error: "Invalid credentials" });
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

  // Admin APIs
  const ADMIN_SECRET = "exam-admin-2026";
  app.get("/admin/stats", async (req, res) => {
    if (req.headers.authorization !== `Bearer ${ADMIN_SECRET}`) return res.status(401).end();
    if (!db) return res.status(503).end();
    const usersCount = (await db.get("SELECT COUNT(*) as count FROM users")).count;
    const schoolsCount = (await db.get("SELECT COUNT(*) as count FROM schools")).count;
    res.json({ totalUsers: usersCount, totalSchools: schoolsCount });
  });

  // Serve Frontend
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
