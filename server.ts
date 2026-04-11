import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Modality } from "@google/genai";
import fs from "fs";
import axios from "axios";
import { getDb } from "./src/db";

async function startServer() {
  const app = express();
  const PORT = 3000;
  const db = await getDb();

  app.use(express.json({ limit: '50mb' }));
  
  // Trust proxy for production (needed for some headers)
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

  // API to handle simple auth (since Firebase is blocked)
  app.post("/api/auth/simple", async (req, res) => {
    const { uid, email, displayName } = req.body;
    if (!uid) return res.status(400).json({ error: "UID required" });

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

  // Paystack: Initialize Transaction
  app.post("/api/payments/initialize", async (req, res) => {
    const { email, amount, userId, planName } = req.body;
    
    if (!PAYSTACK_SECRET) {
      return res.status(500).json({ error: "Paystack is not configured" });
    }

    try {
      const response = await axios.post(
        "https://api.paystack.co/transaction/initialize",
        {
          email,
          amount: amount * 100, // Paystack expects amount in kobo
          metadata: {
            userId,
            planName,
            credits: PLAN_PRICES[planName] || 0
          },
          callback_url: `${process.env.APP_URL || 'http://localhost:3000'}/payment-success`
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
      console.error("Paystack Init Error:", err.response?.data || err.message);
      res.status(500).json({ error: "Failed to initialize payment" });
    }
  });

  // Paystack: Webhook
  app.post("/api/payments/webhook", async (req, res) => {
    // In production, you should verify the Paystack signature
    const event = req.body;

    if (event.event === "charge.success") {
      const { metadata, customer } = event.data;
      const userId = metadata.userId;
      const creditsToAdd = metadata.credits;

      if (userId && creditsToAdd) {
        try {
          await db.run(
            "UPDATE users SET credits = credits + ? WHERE uid = ?",
            [creditsToAdd, userId]
          );
          console.log(`Successfully added ${creditsToAdd} credits to user ${userId}`);
        } catch (err) {
          console.error("Webhook DB Update Error:", err);
        }
      }
    }

    res.sendStatus(200);
  });

  // Payment Success Route (Frontend)
  app.get("/payment-success", (req, res) => {
    const distPath = path.join(process.cwd(), "dist");
    res.sendFile(path.join(distPath, "index.html"));
  });

  // API to transcribe audio (Voice-to-Text)
  app.post("/api/transcribe", async (req, res) => {
    const { audioBase64 } = req.body;
    if (!audioBase64) return res.status(400).json({ error: "Audio data required" });

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite-preview",
        contents: [
          {
            inlineData: {
              data: audioBase64.split(',')[1] || audioBase64,
              mimeType: "audio/webm"
            }
          },
          { text: "Transcribe this audio exactly as spoken. If it's in Nigerian Pidgin, transcribe it in Pidgin. Return ONLY the transcription text, nothing else." }
        ],
      });

      res.json({ text: response.text?.trim() || "" });
    } catch (err) {
      console.error("Transcription Error:", err);
      res.status(500).json({ error: "Could not transcribe audio" });
    }
  });

  // API to handle AI questions (Streaming)
  app.post("/ask-question", async (req, res) => {
    const { user_id, level, subject, questionText, usePidgin, imageBase64, school_id } = req.body;
    
    try {
      const currentCreditsVal = await getUserCredits(user_id);
      if (currentCreditsVal < 1) {
        return res.status(403).json({ error: "Insufficient credits. Please top up." });
      }

      let schoolBranding = "";
      if (school_id) {
        const school = await db.get("SELECT school_name FROM schools WHERE school_id = ?", [school_id]);
        if (school) {
          schoolBranding = `You are teaching on behalf of ${school.school_name}. Occasionally (but not every time), mention that "${school.school_name} recommends this method" or subtly reference the school's commitment to excellence. Keep it natural and don't overdo it.`;
        }
      }

      const systemInstruction = `
        You are "ExamPLE", a highly experienced Nigerian teacher with expertise in Primary, Secondary, and Exam-level (WAEC, NECO, JAMB) education.
        Your goal is to help students learn and excel.
        
        ${schoolBranding}
        
        Tone: Friendly, motivating, encouraging, and warm. Use typical Nigerian teacher expressions like "My dear student", "Listen carefully", "You can do this!".
        
        Language: Standard English by default. 
        ${usePidgin ? "IMPORTANT: The student has requested you speak in Nigerian Pidgin. Use warm, authentic Nigerian Pidgin for the entire explanation." : "Use clear, simple English."}
        
        Output Format (Markdown):
        # Answer
        [Provide a clear, step-by-step solution to the question]
        
        # Explanation
        [Explain the concept behind the answer in a way that is easy to understand, using relatable Nigerian examples if possible (e.g., buying things at the market, sharing chin-chin, etc.)]
        
        ${level === "Exam" ? "# Exam Tips\n[Provide specific tips for tackling this type of question in an exam setting like JAMB or WAEC]" : ""}
        
        # Encouragement
        [A final motivating sentence to keep the student going]

        CRITICAL MATH FORMATTING:
        - DO NOT wrap simple variables or digits in dollar signs (e.g., use "s = u + v" instead of "$s=$u+$v").
        - For complex formulas, use standard text or clear Markdown. 
        - Avoid LaTeX delimiters like "$" or "$$" unless absolutely necessary for very complex notation.
        - Ensure all numbers and formulas are easy to read as plain text.
      `;

      const promptParts: any[] = [
        `Student Level: ${level || "Secondary"}`,
        `Subject: ${subject || "General"}`,
        `Question: ${questionText}`
      ];

      if (imageBase64) {
        promptParts.push({
          inlineData: {
            data: imageBase64.split(',')[1] || imageBase64,
            mimeType: "image/jpeg"
          }
        });
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const stream = await ai.models.generateContentStream({
        model: "gemini-3.1-flash-lite-preview",
        contents: [{
          role: "user",
          parts: promptParts.map(p => typeof p === 'string' ? { text: p } : p)
        }],
        config: {
          temperature: 0.7,
          systemInstruction: systemInstruction,
        },
      });

      let fullText = "";
      for await (const chunk of stream) {
        const chunkText = chunk.text;
        if (chunkText) {
          fullText += chunkText;
          res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
        }
      }

      // Deduct credit
      await db.run("UPDATE users SET credits = MAX(0, credits - 1) WHERE uid = ?", [user_id]);
      
      res.write(`data: [DONE]\n\n`);
      res.end();

    } catch (err: any) {
      console.error("AI Error Details:", err);
      res.write(`data: ${JSON.stringify({ error: "Teacher is busy. Please try again later.", debug: err.message })}\n\n`);
      res.end();
    }
  });

  // API to handle Audio generation
  app.post("/get-audio", async (req, res) => {
    const { text, usePidgin } = req.body;
    
    try {
      const cleanText = text
        .replace(/#+ /g, '')
        .replace(/\*/g, '')
        .replace(/\[|\]/g, '')
        .slice(0, 1500);

      const prompt = `Say this cheerfully and with the warmth of a Nigerian teacher${usePidgin ? " in Pidgin" : ""}: ${cleanText}`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      res.json({ audio: base64Audio });
    } catch (err) {
      console.error("Audio Error:", err);
      res.status(500).json({ error: "Could not generate audio" });
    }
  });

  // API to deduct credits
  app.post("/api/credits/deduct", async (req, res) => {
    const { user_id, credits_to_deduct } = req.body;
    if (!user_id) return res.status(400).json({ error: "User ID required" });
    
    try {
      const currentCredits = await getUserCredits(user_id);
      const deductAmount = Number(credits_to_deduct) || 1;

      if (currentCredits < deductAmount) {
        return res.status(403).json({ error: "Insufficient credits. Please top up." });
      }
      
      const newBalance = currentCredits - deductAmount;
      await db.run("UPDATE users SET credits = ? WHERE uid = ?", [newBalance, user_id]);
      
      res.json({ 
        status: "success",
        new_balance: newBalance 
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to deduct credits" });
    }
  });

  app.get("/check-credits", async (req, res) => {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: "user_id is required" });
    
    try {
      const credits = await getUserCredits(user_id as string);
      res.json({ credits });
    } catch (err) {
      res.status(500).json({ error: "Failed to check credits" });
    }
  });

  // API to register a new school
  app.post("/register-school", async (req, res) => {
    const { school_name, password } = req.body;
    if (!school_name || !password) return res.status(400).json({ error: "School name and password are required" });
    
    try {
      const base_slug = school_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      let school_slug = base_slug;
      
      // Check if slug exists
      const existing = await db.get("SELECT school_id FROM schools WHERE school_slug = ?", [school_slug]);
      if (existing) {
        return res.status(400).json({ error: "A school with this name or a very similar name already exists. Please try a slightly different name." });
      }

      const school_id = `sch_${Math.random().toString(36).substring(2, 9)}`;
      const referral_code = Math.random().toString(36).substring(2, 8).toUpperCase();

      await db.run(
        "INSERT INTO schools (school_id, school_name, school_slug, referral_code, password) VALUES (?, ?, ?, ?, ?)",
        [school_id, school_name, school_slug, referral_code, password]
      );
      
      await db.run(
        "INSERT INTO activity (type, details, timestamp) VALUES (?, ?, ?)",
        ['school_registration', JSON.stringify({ school_name }), Date.now()]
      );

      const botNumber = "2348012345678";
      const whatsappLink = `https://wa.me/${botNumber}?text=JOIN%20${referral_code}`;

      res.json({
        school_name,
        school_id,
        school_slug,
        referral_code,
        whatsapp_link: whatsappLink
      });
    } catch (err) {
      console.error("Registration error:", err);
      res.status(500).json({ error: "Failed to register school. Name might already be taken." });
    }
  });

  app.post("/school-login", async (req, res) => {
    const { school_slug, password } = req.body;
    if (!school_slug || !password) return res.status(400).json({ error: "Slug and password required" });

    try {
      const school = await db.get("SELECT * FROM schools WHERE school_slug = ? AND password = ?", [school_slug, password]);
      if (school) {
        res.json({ success: true, school_id: school.school_id, school_name: school.school_name });
      } else {
        res.status(401).json({ error: "Invalid credentials" });
      }
    } catch (err) {
      res.status(500).json({ error: "Login failed" });
    }
  });

  // New endpoint to load school context by slug
  app.get("/api/schools/by-slug/:slug", async (req, res) => {
    const { slug } = req.params;
    
    try {
      const school = await db.get("SELECT * FROM schools WHERE school_slug = ?", [slug]);
      
      if (!school) {
        return res.status(404).json({ error: "School not found" });
      }

      res.json(school);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch school" });
    }
  });

  app.post("/payment-webhook", async (req, res) => {
    const { user_id, amount, credits_added, plan_name } = req.body;
    if (!user_id || credits_added === undefined) {
      return res.status(400).json({ error: "user_id and credits_added are required" });
    }

    try {
      const added = Number(credits_added) || 0;
      const paymentAmount = Number(amount) || 0;
      
      const currentBalance = await getUserCredits(user_id);
      const newBalance = currentBalance + added;
      
      await db.run("UPDATE users SET credits = ? WHERE uid = ?", [newBalance, user_id]);
      
      // Update global stats
      await db.run("UPDATE stats SET value = value + ? WHERE key = 'totalRevenue'", [paymentAmount]);

      await db.run(
        "INSERT INTO activity (type, details, timestamp) VALUES (?, ?, ?)",
        ['payment', JSON.stringify({ user_id, amount: paymentAmount, plan_name }), Date.now()]
      );

      let schoolNotification = "";
      const user = await db.get("SELECT schoolId FROM users WHERE uid = ?", [user_id]);
      
      if (user?.schoolId) {
        const schoolEarning = paymentAmount * 0.5;
        await db.run("UPDATE schools SET total_earnings = total_earnings + ? WHERE school_id = ?", [schoolEarning, user.schoolId]);
        const school = await db.get("SELECT school_name FROM schools WHERE school_id = ?", [user.schoolId]);
        schoolNotification = `🎉 Congrats!\n\nA student from your school just subscribed.\n\nYou earned ₦${schoolEarning}.\n\nKeep inviting more students!`;
      }

      res.json({
        status: "success",
        new_balance: newBalance,
        school_notification: schoolNotification
      });
    } catch (err) {
      res.status(500).json({ error: "Payment processing failed" });
    }
  });

  app.post("/school-dashboard", async (req, res) => {
    const { school_slug } = req.body;
    if (!school_slug) return res.status(400).json({ error: "school_slug is required" });

    try {
      const school = await db.get("SELECT * FROM schools WHERE school_slug = ?", [school_slug]);
      
      if (!school) {
        return res.status(404).json({ error: "School not found" });
      }

      const active_users = Math.floor(school.total_students * (0.6 + Math.random() * 0.4));
      const withdrawals = await db.all("SELECT * FROM withdrawals WHERE school_id = ? ORDER BY timestamp DESC", [school.school_id]);

      res.json({
        ...school,
        active_users,
        withdrawals
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to load dashboard" });
    }
  });

  app.post("/request-withdrawal", async (req, res) => {
    const { school_id, amount } = req.body;
    const withdrawalAmount = Number(amount);

    if (!school_id || isNaN(withdrawalAmount)) {
      return res.status(400).json({ error: "Invalid request data" });
    }

    try {
      const school = await db.get("SELECT * FROM schools WHERE school_id = ?", [school_id]);
      
      if (!school) {
        return res.status(404).json({ error: "School not found" });
      }

      if (withdrawalAmount > school.total_earnings) {
        return res.status(400).json({ error: "Insufficient balance" });
      }

      const withdrawalId = `wd_${Math.random().toString(36).substring(2, 9)}`;
      await db.run(
        "INSERT INTO withdrawals (id, school_id, amount, status, timestamp) VALUES (?, ?, ?, ?, ?)",
        [withdrawalId, school_id, withdrawalAmount, 'pending', Date.now()]
      );

      await db.run("UPDATE schools SET total_earnings = total_earnings - ? WHERE school_id = ?", [withdrawalAmount, school_id]);
      await db.run("UPDATE stats SET value = value + ? WHERE key = 'totalWithdrawals'", [withdrawalAmount]);

      await db.run(
        "INSERT INTO activity (type, details, timestamp) VALUES (?, ?, ?)",
        ['withdrawal', JSON.stringify({ school_name: school.school_name, amount: withdrawalAmount }), Date.now()]
      );

      res.json({ 
        message: "Withdrawal request submitted ✅\nYou will receive payment within 24–48 hours.",
        new_balance: school.total_earnings - withdrawalAmount
      });
    } catch (err) {
      res.status(500).json({ error: "Withdrawal failed" });
    }
  });

  // Admin APIs
  const ADMIN_SECRET = "exam-admin-2026";

  app.use("/admin/*", (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader === `Bearer ${ADMIN_SECRET}`) {
      next();
    } else {
      res.status(401).json({ error: "Unauthorized" });
    }
  });

  app.get("/admin/stats", async (req, res) => {
    try {
      const stats = await db.all("SELECT * FROM stats");
      const statsMap = stats.reduce((acc: any, s: any) => ({ ...acc, [s.key]: s.value }), {});
      
      const usersCount = (await db.get("SELECT COUNT(*) as count FROM users")).count;
      const schoolsCount = (await db.get("SELECT COUNT(*) as count FROM schools")).count;

      res.json({
        totalUsers: usersCount,
        totalSchools: schoolsCount,
        totalRevenue: statsMap.totalRevenue,
        totalWithdrawals: statsMap.totalWithdrawals
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  app.get("/admin/schools", async (req, res) => {
    try {
      const schools = await db.all("SELECT * FROM schools");
      res.json(schools);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch schools" });
    }
  });

  app.get("/admin/activity", async (req, res) => {
    try {
      const activity = await db.all("SELECT * FROM activity ORDER BY timestamp DESC LIMIT 50");
      res.json(activity.map(a => ({ ...a, details: JSON.parse(a.details) })));
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch activity" });
    }
  });

  app.get("/admin/withdrawals", async (req, res) => {
    try {
      const withdrawals = await db.all(`
        SELECT w.*, s.school_name 
        FROM withdrawals w 
        JOIN schools s ON w.school_id = s.school_id 
        ORDER BY w.timestamp DESC
      `);
      res.json(withdrawals);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch withdrawals" });
    }
  });

  app.post("/admin/withdrawals/mark-paid", async (req, res) => {
    const { withdrawal_id } = req.body;
    try {
      await db.run("UPDATE withdrawals SET status = 'paid' WHERE id = ?", [withdrawal_id]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to mark as paid" });
    }
  });

  // API to handle WhatsApp messages
  app.post("/api/whatsapp/message", async (req, res) => {
    const { user_id, user_message } = req.body;

    if (!user_id || !user_message) {
      return res.status(400).json({ error: "user_id and user_message are required" });
    }

    try {
      const message = user_message.trim();

      if (message.toUpperCase().startsWith("JOIN")) {
        const referral_code = message.split(" ")[1];
        
        if (!referral_code) {
          return res.json({ message: "Please provide a referral code. Example: JOIN ABC123" });
        }

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
