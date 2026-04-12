import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Modality } from "@google/genai";
import fs from "fs";
import axios from "axios";
import { getDb } from "./src/db.js";

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;
  const db = await getDb();

  app.use(express.json({ limit: '50mb' }));
  
  // Trust proxy for production
  app.set('trust proxy', 1);

  const apiKey = (process.env.REAL_GEMINI_KEY || process.env.GEMINI_API_KEY || "").trim();
  
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    console.error("CRITICAL: API Key is missing or is a placeholder.");
  }
  
  const ai = new GoogleGenAI({ apiKey });

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

  // API to handle simple auth
  app.post("/api/auth/simple", async (req, res) => {
    const { uid, email, displayName } = req.body;
    if (!uid) return res.status(400).json({ error: "UID required" });

    try {
      const user = await db.get("SELECT * FROM users WHERE uid = ?", [uid]);
      if (!user) {
        await db.run("INSERT INTO users (uid, credits) VALUES (?, ?)", [uid, 10]);
      }
      const profile = await db.get("SELECT * FROM users WHERE uid = ?", [uid]);
      res.json(profile);
    } catch (err) {
      res.status(500).json({ error: "Auth failed" });
    }
  });

  // Paystack Initialization
  app.post("/api/payments/initialize", async (req, res) => {
    const { email, amount, userId, planName } = req.body;
    
    try {
      const response = await axios.post(
        "https://api.paystack.co/transaction/initialize",
        {
          email,
          amount: amount * 100, // Paystack expects kobo
          callback_url: `${process.env.APP_URL || 'https://' + req.get('host')}/payment-success`,
          metadata: { userId, planName, amount }
        },
        {
          headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET}`,
            "Content-Type": "application/json"
          }
        }
      );
      res.json(response.data);
    } catch (err: any) {
      console.error("Paystack init error:", err.response?.data || err.message);
      res.status(500).json({ error: "Payment initialization failed" });
    }
  });

  // Paystack Webhook
  app.post("/api/payments/webhook", async (req, res) => {
    const event = req.body;
    if (event.event === "charge.success") {
      const { userId, planName } = event.data.metadata;
      const creditsToAdd = planName === 'Small' ? 20 : planName === 'Medium' ? 50 : 200;
      
      await db.run("UPDATE users SET credits = credits + ? WHERE uid = ?", [creditsToAdd, userId]);
      
      // If user belongs to a school, add earnings to school
      const user = await db.get("SELECT schoolId FROM users WHERE uid = ?", [userId]);
      if (user?.schoolId) {
        const amountPaid = event.data.amount / 100;
        const schoolEarnings = amountPaid * 0.5; // 50% share
        await db.run("UPDATE schools SET total_earnings = total_earnings + ? WHERE school_id = ?", [schoolEarnings, user.schoolId]);
      }
    }
    res.sendStatus(200);
  });

  app.post("/ask-question", async (req, res) => {
    const { user_id, level, subject, questionText, usePidgin, imageBase64, school_id } = req.body;

    try {
      const credits = await getUserCredits(user_id);
      if (credits < 1) {
        return res.status(403).json({ error: "Insufficient credits" });
      }

      const model = ai.getGenerativeModel({ model: "gemini-2.0-flash" });
      
      let prompt = `You are a professional Nigerian teacher for ${level} students. 
      Subject: ${subject}. 
      Language: ${usePidgin ? "Nigerian Pidgin English" : "Standard English"}.
      Branding: Always mention "ExamPLE" as the learning platform.
      Tone: Encouraging, clear, and educational.
      
      Question: ${questionText}`;

      if (school_id) {
        const school = await db.get("SELECT school_name FROM schools WHERE school_id = ?", [school_id]);
        if (school) {
          prompt += `\nNote: This student is from ${school.school_name}. Acknowledge them warmly.`;
        }
      }

      const parts: any[] = [{ text: prompt }];
      if (imageBase64) {
        parts.push({
          inlineData: {
            mimeType: "image/jpeg",
            data: imageBase64.split(",")[1]
          }
        });
      }

      const result = await model.generateContentStream(parts);
      
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
      }

      // Deduct credit after successful generation
      await db.run("UPDATE users SET credits = credits - 1 WHERE uid = ?", [user_id]);
      res.write(`data: [DONE]\n\n`);
      res.end();

    } catch (err: any) {
      console.error("AI Error:", err);
      res.status(500).json({ error: "Teacher is busy", debug: err.message });
    }
  });

  app.post("/get-audio", async (req, res) => {
    const { text, usePidgin } = req.body;
    try {
      const model = ai.getGenerativeModel({ model: "gemini-2.0-flash" });
      const prompt = `Convert this educational text into a natural spoken ${usePidgin ? "Nigerian Pidgin" : "Nigerian English"} voice script. Keep it exactly as the text but formatted for TTS. Text: ${text}`;
      
      const result = await model.generateContent([prompt]);
      const audioText = result.response.text();
      
      // In a real app, you'd use a TTS API here. 
      // For this demo, we'll return a placeholder or use Gemini's experimental TTS if available.
      res.json({ message: "Audio generation would happen here with a TTS provider like Google Cloud TTS." });
    } catch (err) {
      res.status(500).json({ error: "Audio failed" });
    }
  });

  // School Registration
  app.post("/register-school", async (req, res) => {
    const { school_name, password } = req.body;
    const school_slug = school_name.toLowerCase().replace(/\s+/g, '-');
    const referral_code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const school_id = `sch_${Date.now()}`;

    try {
      await db.run(
        "INSERT INTO schools (school_id, school_name, school_slug, password, referral_code) VALUES (?, ?, ?, ?, ?)",
        [school_id, school_name, school_slug, password, referral_code]
      );
      res.json({ school_id, school_name, school_slug, referral_code });
    } catch (err) {
      res.status(500).json({ error: "School registration failed" });
    }
  });

  // School Login
  app.post("/school-login", async (req, res) => {
    const { school_slug, password } = req.body;
    const school = await db.get("SELECT * FROM schools WHERE school_slug = ? AND password = ?", [school_slug, password]);
    if (school) {
      res.json({ success: true });
    } else {
      res.status(401).json({ error: "Invalid credentials" });
    }
  });

  // School Dashboard Data
  app.post("/school-dashboard", async (req, res) => {
    const { school_slug } = req.body;
    const school = await db.get("SELECT * FROM schools WHERE school_slug = ?", [school_slug]);
    if (!school) return res.status(404).json({ error: "Not found" });

    const withdrawals = await db.all("SELECT * FROM withdrawals WHERE school_id = ? ORDER BY timestamp DESC", [school.school_id]);
    
    res.json({
      ...school,
      withdrawals,
      active_users: Math.floor(school.total_students * 0.8) // Mock active users
    });
  });

  // Withdrawal Request
  app.post("/request-withdrawal", async (req, res) => {
    const { school_id, amount } = req.body;
    const school = await db.get("SELECT * FROM schools WHERE school_id = ?", [school_id]);
    
    if (amount > school.total_earnings) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    const id = `wd_${Date.now()}`;
    await db.run(
      "INSERT INTO withdrawals (id, school_id, school_name, amount) VALUES (?, ?, ?, ?)",
      [id, school_id, school.school_name, amount]
    );
    await db.run("UPDATE schools SET total_earnings = total_earnings - ? WHERE school_id = ?", [amount, school_id]);

    res.json({ message: "Withdrawal request submitted! We will process it within 24 hours." });
  });

  // Admin Routes
  app.get("/admin/stats", async (req, res) => {
    if (req.headers.authorization !== "Bearer exam-admin-2026") return res.sendStatus(401);
    const totalUsers = (await db.get("SELECT COUNT(*) as count FROM users")).count;
    const totalSchools = (await db.get("SELECT COUNT(*) as count FROM schools")).count;
    const totalRevenue = (await db.get("SELECT SUM(total_earnings) * 2 as count FROM schools")).count || 0;
    const totalWithdrawals = (await db.get("SELECT SUM(amount) as count FROM withdrawals WHERE status = 'paid'")).count || 0;
    res.json({ totalUsers, totalSchools, totalRevenue, totalWithdrawals });
  });

  app.get("/admin/schools", async (req, res) => {
    if (req.headers.authorization !== "Bearer exam-admin-2026") return res.sendStatus(401);
    const schools = await db.all("SELECT * FROM schools");
    res.json(schools);
  });

  app.get("/admin/withdrawals", async (req, res) => {
    if (req.headers.authorization !== "Bearer exam-admin-2026") return res.sendStatus(401);
    const withdrawals = await db.all("SELECT * FROM withdrawals ORDER BY timestamp DESC");
    res.json(withdrawals);
  });

  app.post("/admin/withdrawals/mark-paid", async (req, res) => {
    if (req.headers.authorization !== "Bearer exam-admin-2026") return res.sendStatus(401);
    const { withdrawal_id } = req.body;
    await db.run("UPDATE withdrawals SET status = 'paid' WHERE id = ?", [withdrawal_id]);
    res.json({ success: true });
  });

  app.get("/api/schools/by-slug/:slug", async (req, res) => {
    const school = await db.get("SELECT school_name, school_id, school_slug FROM schools WHERE school_slug = ?", [req.params.slug]);
    if (school) res.json(school);
    else res.status(404).json({ error: "Not found" });
  });

  app.post("/api/whatsapp/message", async (req, res) => {
    const { user_id, user_message } = req.body;
    try {
      if (user_message.toUpperCase().startsWith("JOIN ")) {
        const referral_code = user_message.split(" ")[1];
        if (!referral_code) return res.json({ message: "Please provide a referral code. Example: JOIN ABC123" });

        const school = await db.get("SELECT * FROM schools WHERE referral_code = ?", [referral_code.toUpperCase()]);

        if (school) {
          await db.run("UPDATE users SET schoolId = ? WHERE uid = ?", [school.school_id, user_id]);
          await db.run("UPDATE schools SET total_students = total_students + 1 WHERE school_id = ?", [school.school_id]);

          return res.json({
            message: `Welcome to ExamPLE 🎓\nPowered by ${school.school_name} 🏫\n\nLet’s help you pass your exams!\n\nChoose an option:\n1. Ask Question\n2. Upload Image\n3. Check Credits`
          });
        } else {
          return res.json({ message: "Ouch! That referral code is not valid. Please check and try again." });
        }
      }
      res.json({ message: "I didn't recognize that command. Try sending 'JOIN [CODE]' to connect to your school." });
    } catch (err) {
      res.status(500).json({ error: "WhatsApp processing failed" });
    }
  });

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

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  server.on('error', (e: any) => {
    if (e.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Retrying in 1s...`);
      setTimeout(() => {
        server.close();
        server.listen(PORT, "0.0.0.0");
      }, 1000);
    } else {
      console.error("Server error:", e);
    }
  });
}

startServer();
