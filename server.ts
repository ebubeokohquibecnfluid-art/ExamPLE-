import express from "express";
import path from "path";
import fs from "fs";
import axios from "axios";
import cors from "cors";
import { GoogleGenAI, Modality } from "@google/genai";
import { TextToSpeechClient } from "@google-cloud/text-to-speech";
import { getDb } from "./src/db.js";

const app = express();
const PORT = Number(process.env.PORT) || 5000;

// --- 1. CORS CONFIGURATION ---
app.use(cors());

// --- 2. DEDICATED HEALTH CHECK ---
app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

// --- 3. EXPRESS CONFIGURATION ---
app.use(express.json({
  limit: "50mb",
  verify: (req: any, _res, buf) => { req.rawBody = buf; }
}));
app.set("trust proxy", 1);

// --- 4. SAFE DATABASE INITIALIZATION (Non-blocking) ---
let db = null;
getDb()
  .then(database => {
    db = database;
    console.log("✅ Database connected in background");
    
    // Ensure schema is up to date (IF NOT EXISTS prevents errors on re-runs)
    db.run("ALTER TABLE users ADD COLUMN IF NOT EXISTS expiry_date TEXT").catch(() => {});
    db.run("ALTER TABLE users ADD COLUMN IF NOT EXISTS displayname TEXT").catch(() => {});
    db.run("ALTER TABLE schools ADD COLUMN IF NOT EXISTS total_earnings REAL DEFAULT 0").catch(() => {});
  })
  .catch(err => {
    console.error("❌ DB Connection Error:", err);
  });

// --- 5. ENVIRONMENT VARIABLES ---
const apiKey = (process.env.REAL_GEMINI_KEY || process.env.GEMINI_API_KEY || "").trim();
if (!apiKey) console.error("❌ Missing Gemini API Key");

const ai = new GoogleGenAI({ apiKey });
const ttsClient = new TextToSpeechClient();
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
const PLAN_PRICES = { 'Basic': 2500, 'Premium': 4500, 'Max': 6500, 'Top-up': 500 };
const PLAN_UNITS = { 'Basic': 50, 'Premium': 100, 'Max': 250, 'Top-up': 10 };

// Helper for credits
const getUserCredits = async (userId) => {
  if (!db) return 0;
  try {
    const user = await db.get("SELECT credits, expiry_date, trial_expires_at FROM users WHERE uid = ?", [userId]);
    if (!user) return 0;

    const now = new Date();

    // Check paid subscription expiry
    if (user.expiry_date) {
      const subExpiry = new Date(user.expiry_date);
      if (subExpiry < now) {
        await db.run("UPDATE users SET credits = 0, expiry_date = NULL WHERE uid = ?", [userId]);
        return 0;
      }
      // Active subscription — return credits normally
      return user.credits;
    }

    // No paid subscription — check 48-hour free trial window
    if (user.trial_expires_at) {
      const trialExpiry = new Date(user.trial_expires_at);
      if (trialExpiry < now) {
        // Trial window has closed — zero out any remaining free credits
        if (user.credits > 0) await db.run("UPDATE users SET credits = 0 WHERE uid = ?", [userId]);
        return 0;
      }
    }

    return user.credits;
  } catch (e) { return 0; }
};

// --- 6. API ENDPOINTS ---
app.post("/api/auth/simple", async (req, res) => {
  const { uid, returnOnly, displayName } = req.body;
  if (!uid || !db) return res.status(400).json({ error: "Missing data" });
  try {
    const user = await db.get("SELECT * FROM users WHERE uid = ?", [uid]);
    if (!user) {
      if (returnOnly) return res.status(404).json({ error: "User not found" });

      // IP abuse check — only for new independent students (no school link yet)
      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
      const adminBypass = req.headers['x-admin-bypass'];
      const isAdminBypass = adminBypass && adminBypass === (process.env.ADMIN_SECRET || ADMIN_SECRET);
      if (!isAdminBypass) {
        const existingFromIp = await db.get("SELECT uid FROM users WHERE created_ip = ? AND schoolid IS NULL", [clientIp]);
        if (existingFromIp && clientIp !== 'unknown') {
          return res.status(429).json({ error: "IP_LIMIT", message: "An account already exists from this network. Please use your existing Student Code to log in." });
        }
      }

      const trialExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
      await db.run("INSERT INTO users (uid, credits, displayName, created_ip, trial_expires_at) VALUES (?, ?, ?, ?, ?)", [uid, 10, displayName || "Student", clientIp, trialExpiresAt]);
    } else if (displayName && !user.displayName) {
      await db.run("UPDATE users SET displayName = ? WHERE uid = ?", [displayName, uid]);
    }
    res.json(await db.get("SELECT * FROM users WHERE uid = ?", [uid]));
  } catch (err) { res.status(500).json({ error: "Auth failed" }); }
});

// School Password Reset
app.post("/api/schools/reset-password", async (req, res) => {
  const { referral_code, new_password } = req.body;
  if (!referral_code || !new_password || !db) return res.status(400).json({ error: "Missing data" });
  try {
    const school = await db.get("SELECT * FROM schools WHERE referral_code = ?", [referral_code.toUpperCase()]);
    if (!school) return res.status(404).json({ error: "Invalid referral code" });
    
    await db.run("UPDATE schools SET password = ? WHERE referral_code = ?", [new_password, referral_code.toUpperCase()]);
    res.json({ success: true, message: "Password reset successfully" });
  } catch (err) { res.status(500).json({ error: "Reset failed" }); }
});

// Student Code Recovery
app.post("/api/students/recover-code", async (req, res) => {
  const { displayName, school_slug } = req.body;
  if (!displayName || !db) return res.status(400).json({ error: "Missing name" });
  try {
    let student;
    if (school_slug && school_slug.trim()) {
      // School-linked student: find by name + school
      const school = await db.get("SELECT school_id FROM schools WHERE school_slug = ?", [school_slug.toLowerCase().trim()]);
      if (!school) return res.status(404).json({ error: "School not found. Check the school slug and try again." });
      student = await db.get("SELECT uid, displayName FROM users WHERE displayName = ? AND schoolId = ?", [displayName, school.school_id]);
      if (!student) return res.status(404).json({ error: "No student found with that name in this school." });
    } else {
      // Independent student: find by name with no school linked
      student = await db.get("SELECT uid, displayName FROM users WHERE displayName = ? AND schoolId IS NULL", [displayName]);
      if (!student) return res.status(404).json({ error: "No independent student found with that name." });
    }
    const code = student.uid.replace('user_', '');
    res.json({ success: true, code, displayName: student.displayName });
  } catch (err) { res.status(500).json({ error: "Recovery failed" }); }
});

app.post("/api/payments/initialize", async (req, res) => {
  const { email, amount, userId, planName } = req.body;
  const credits = PLAN_UNITS[planName] || 0;
  
  // Demo Mode check
  if (PAYSTACK_SECRET === "sk_test_examPLE_demo_key_999") {
    return res.json({ status: true, data: { authorization_url: `${process.env.APP_URL || ''}/payment-success?demo=true&userId=${userId}&credits=${credits}&amount=${amount}` } });
  }
  if (!PAYSTACK_SECRET) return res.status(500).json({ error: "Paystack not configured" });
  try {
    const response = await axios.post("https://api.paystack.co/transaction/initialize", {
      email, 
      amount: amount * 100, 
      metadata: { userId, planName, credits },
      callback_url: `${process.env.APP_URL}/payment-success`
    }, { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } });
    res.json(response.data);
  } catch (err) { res.status(500).json({ error: "Payment failed" }); }
});

app.get("/payment-success", async (req, res) => {
  const { demo, userId, credits, amount } = req.query;
  const creditAmount = Number(credits);
  const payAmount = Number(amount);
  
  if (demo === "true" && userId && creditAmount && db) {
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 30);
    const expiryStr = expiry.toISOString();
    
    await db.run("UPDATE users SET credits = credits + ?, expiry_date = ? WHERE uid = ?", [creditAmount, expiryStr, userId]);
    
    // Revenue Sharing (40% to school)
    const user = await db.get("SELECT schoolId FROM users WHERE uid = ?", [userId]);
    if (user && user.schoolId) {
      const schoolComm = payAmount * 0.4;
      await db.run("UPDATE schools SET total_earnings = total_earnings + ? WHERE school_id = ?", [schoolComm, user.schoolId]);
    }
    
    // Log activity
    await db.run("INSERT INTO activity (type, details, timestamp) VALUES (?, ?, ?)", [
      'payment', 
      JSON.stringify({ userId, amount: payAmount, credits: creditAmount }), 
      new Date().toISOString()
    ]);
  }
  const distPath = path.join(process.cwd(), "dist");
  res.sendFile(path.join(distPath, "index.html"));
});

app.post("/ask-question", async (req, res) => {
  const { user_id, questionText, level, subject, usePidgin, imageBase64, isVoice } = req.body;
  const cost = isVoice ? 2 : 1;
  try {
    const credits = await getUserCredits(user_id);
    if (credits < cost) return res.status(403).json({ error: "Not enough credits" });

    const levelLabel = level || "Secondary";
    const subjectLabel = subject || "General";
    const tone = usePidgin
      ? "Respond in Nigerian Pidgin English, friendly and encouraging."
      : "Respond in clear, friendly English suitable for Nigerian students.";

    const systemInstruction = `You are ExamPLE AI, an expert Nigerian tutor for ${subjectLabel} at ${levelLabel} level (WAEC, NECO, JAMB, Common Entrance curricula).

CRITICAL RULES — follow every one, every time:
1. NEVER open with a greeting, preamble, or motivational phrase. Jump straight into the answer or question.
2. When a student asks for an exam question: immediately write out a real past-WAEC/NECO/JAMB-style question with options A–D (where applicable), then give the correct answer and a full step-by-step worked solution.
3. NEVER use LaTeX math delimiters. Do NOT wrap expressions in dollar signs. Write maths in plain text: use ^ for powers (x^2), * for multiply, / for divide, sqrt() for square roots. Example: write  x^2 + 5x + 6 = 0  NOT  $x^2 + 5x + 6 = 0$.
4. Use markdown formatting: **bold** for key terms, bullet points for lists, numbered steps for working.
5. Use relatable Nigerian examples where helpful (markets, naira, local foods, geography).
6. ${tone}`;


    const parts: any[] = [];
    if (imageBase64) {
      const mimeMatch = imageBase64.match(/^data:([^;]+);base64,/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
      const base64Data = imageBase64.replace(/^data:[^;]+;base64,/, '');
      parts.push({ inlineData: { mimeType, data: base64Data } });
    }
    parts.push({ text: questionText || "Explain this image in detail." });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const stream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      config: {
        systemInstruction,
        thinkingConfig: { thinkingBudget: 0 }, // Disable thinking — stream pure text immediately
      },
      contents: [{ role: "user", parts }],
    });

    let totalText = "";
    for await (const chunk of stream) {
      // Extract text from all non-thought parts explicitly
      const parts = chunk.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if (part.thought) continue; // skip thinking tokens
        const txt = part.text ?? "";
        if (txt) {
          totalText += txt;
          res.write(`data: ${JSON.stringify({ text: txt })}\n\n`);
        }
      }
      // Fallback: chunk.text shorthand (works when thinking is off)
      if (!chunk.candidates && (chunk as any).text) {
        const txt = (chunk as any).text;
        totalText += txt;
        res.write(`data: ${JSON.stringify({ text: txt })}\n\n`);
      }
    }

    if (db) await db.run("UPDATE users SET credits = GREATEST(0, credits - ?) WHERE uid = ?", [cost, user_id]);
    res.write(`data: [DONE]\n\n`);
    res.end();
  } catch (e: any) {
    console.error("ask-question error:", e?.message || e);
    try { res.write(`data: ${JSON.stringify({ error: "AI unavailable", debug: e?.message })}\n\n`); res.end(); } catch {}
  }
});

app.post("/register-school", async (req, res) => {
  const { school_name, password } = req.body;
  if (!school_name || !password || !db) return res.status(400).json({ error: "Missing data" });
  try {
    const school_slug = school_name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const school_id = `sch_${Math.random().toString(36).substring(2, 9)}`;
    const referral_code = Math.random().toString(36).substring(2, 8).toUpperCase();
    await db.run("INSERT INTO schools (school_id, school_name, school_slug, referral_code, password) VALUES (?, ?, ?, ?, ?)", [school_id, school_name, school_slug, referral_code, password]);
    
    // Log activity
    await db.run("INSERT INTO activity (type, details, timestamp) VALUES (?, ?, ?)", [
      'school_registration', 
      JSON.stringify({ school_name, school_id }), 
      new Date().toISOString()
    ]);

    res.json({ school_name, school_id, school_slug, referral_code });
  } catch (err) { res.status(500).json({ error: "Registration failed" }); }
});

app.post("/get-audio", async (req, res) => {
  const { text, user_id } = req.body;
  try {
    // Deduct 2 units for audio explanation if user_id is provided
    if (user_id && db) {
      const credits = await getUserCredits(user_id);
      if (credits < 2) return res.status(403).json({ error: "Not enough credits for audio" });
      await db.run("UPDATE users SET credits = GREATEST(0, credits - 2) WHERE uid = ?", [user_id]);
    }
    
    try {
      // Primary: Try Google Cloud TTS for authentic Nigerian voice (en-NG)
      const [response] = await ttsClient.synthesizeSpeech({
        input: { text },
        voice: { languageCode: 'en-NG', name: 'en-NG-Wavenet-A' },
        audioConfig: { audioEncoding: 'MP3' },
      });
      if (response.audioContent) {
        return res.json({ 
          audio: Buffer.from(response.audioContent).toString('base64'),
          voice: 'en-NG-Wavenet-A',
          mimeType: 'audio/mpeg'
        });
      }
    } catch (ttsErr) {
      console.warn("Cloud TTS failed, falling back to Gemini:", ttsErr);
    }

    // Fallback: Use Gemini TTS with a Nigerian persona prompt
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ 
        parts: [{ 
          text: `Say this exactly, but use a friendly, professional Nigerian teacher accent and rhythm: ${text}` 
        }] 
      }],
      config: { 
        responseModalities: [Modality.AUDIO], 
        speechConfig: { 
          voiceConfig: { 
            prebuiltVoiceConfig: { voiceName: 'Kore' } 
          } 
        } 
      },
    });
    res.json({ 
      audio: response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data,
      voice: 'gemini-tts-fallback',
      mimeType: 'audio/pcm' // Frontend knows to wrap this in WAV
    });
  } catch (err) { 
    console.error("Audio generation failed:", err);
    res.status(500).json({ error: "Audio failed" }); 
  }
});

// ── EXAM MODE ──────────────────────────────────────────────────────────────

app.post("/api/exam/start", async (req, res) => {
  const { user_id, subject, level, exam_type, num_questions, time_minutes, year, mode } = req.body;
  if (!user_id || !subject || !db) return res.status(400).json({ error: "Missing data" });
  const n = Math.min(Math.max(Number(num_questions) || 10, 5), 30);
  const cost = n; // 1 credit per question
  try {
    const credits = await getUserCredits(user_id);
    if (credits < cost) return res.status(403).json({ error: "Not enough credits", required: cost });

    const examLabel = `${exam_type || 'WAEC'} ${subject}`;
    const levelLabel = level || 'Secondary';

    let contextLine = `for Nigerian ${levelLabel} school students`;
    if (year && mode === 'simulate') {
      contextLine = `replicating the style, difficulty, and topic distribution of the actual ${year} ${examLabel} paper. Draw on the known content areas examined that year. Make questions feel authentic to that specific paper`;
    } else if (year && mode === 'similar') {
      contextLine = `in the style of ${year} ${examLabel} past questions. Use similar question patterns, phrasing, and difficulty level to questions from that era`;
    }

    const prompt = `Generate exactly ${n} multiple-choice questions ${contextLine}.

Return ONLY valid JSON (no markdown, no extra text) in this exact format:
{
  "questions": [
    {
      "q": "Full question text here",
      "opts": ["A. option one", "B. option two", "C. option three", "D. option four"],
      "ans": "A",
      "scheme": "Step 1: [what to do] (1 mark)\\nStep 2: [next step] (1 mark)\\nStep 3: [final answer] (2 marks)",
      "topic": "Short topic name",
      "mistakes": ["Common mistake 1", "Common mistake 2"]
    }
  ]
}

Rules:
- Questions must be actual ${exam_type || 'WAEC'}-standard difficulty for ${subject}
- Each question must have exactly 4 options labeled A, B, C, D
- "ans" must be exactly one of: A, B, C, or D
- "scheme" must show the marking breakdown as ${exam_type || 'WAEC'} markers would write it
- "mistakes" must list 2-3 specific reasons a student might get this wrong
- "topic" should be a short topic name (e.g. "Mole Concept", "Genetics")
- Return ONLY the JSON object, nothing else`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      config: { thinkingConfig: { thinkingBudget: 0 } },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const raw = response.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: "AI failed to generate questions" });

    const parsed = JSON.parse(jsonMatch[0]);
    const questions = parsed.questions?.slice(0, n);
    if (!questions?.length) return res.status(500).json({ error: "No questions returned" });

    const session_id = `exam_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await db.run(
      "INSERT INTO exam_sessions (id, user_id, subject, level, exam_type, questions, total, status, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)",
      [session_id, user_id, subject, level || 'Secondary', exam_type || 'WAEC', JSON.stringify(questions), questions.length, new Date().toISOString()]
    );
    await db.run("UPDATE users SET credits = GREATEST(0, credits - ?) WHERE uid = ?", [cost, user_id]);

    // Return questions WITHOUT answers/scheme/mistakes (those stay server-side)
    res.json({
      session_id,
      subject, level, exam_type, time_minutes,
      questions: questions.map(({ q, opts }: any) => ({ q, opts })),
      total: questions.length,
    });
  } catch (e: any) {
    console.error("exam/start error:", e?.message);
    res.status(500).json({ error: "Failed to generate exam", debug: e?.message });
  }
});

app.post("/api/exam/submit", async (req, res) => {
  const { session_id, user_id, answers } = req.body;
  if (!session_id || !db) return res.status(400).json({ error: "Missing data" });
  try {
    const session = await db.get("SELECT * FROM exam_sessions WHERE id = ? AND user_id = ?", [session_id, user_id]);
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.status === 'completed') return res.status(400).json({ error: "Already submitted" });

    const questions = typeof session.questions === 'string' ? JSON.parse(session.questions) : session.questions;
    let score = 0;
    const results = questions.map((q: any, i: number) => {
      const userAns = answers[i] ?? null;
      const correct = userAns === q.ans;
      if (correct) score++;
      return {
        q: q.q, opts: q.opts, ans: q.ans, userAns,
        correct, topic: q.topic,
        scheme: q.scheme,
        why_wrong: correct ? null : q.mistakes,
      };
    });

    await db.run(
      "UPDATE exam_sessions SET status='completed', score=?, answers=?, completed_at=? WHERE id=?",
      [score, JSON.stringify(answers), new Date().toISOString(), session_id]
    );

    // Log each answer to user_progress
    for (const r of results) {
      await db.run(
        "INSERT INTO user_progress (user_id, subject, is_correct, topic, timestamp) VALUES (?, ?, ?, ?, ?)",
        [user_id, session.subject, r.correct, r.topic, new Date().toISOString()]
      );
    }

    res.json({ score, total: questions.length, subject: session.subject, results });
  } catch (e: any) {
    console.error("exam/submit error:", e?.message);
    res.status(500).json({ error: "Failed to submit exam" });
  }
});

app.get("/api/progress/:user_id", async (req, res) => {
  const { user_id } = req.params;
  if (!db) return res.json({ subjects: [] });
  try {
    const rows = await db.all(
      `SELECT subject,
              COUNT(*) AS total,
              SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) AS correct
       FROM user_progress WHERE user_id = ?
       GROUP BY subject ORDER BY total DESC`,
      [user_id]
    );
    const subjects = rows.map(r => ({
      subject: r.subject,
      total: Number(r.total),
      correct: Number(r.correct),
      pct: Math.round((Number(r.correct) / Number(r.total)) * 100),
    }));

    // Weak topics per subject
    const weakRows = await db.all(
      `SELECT subject, topic, COUNT(*) AS total,
              SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) AS correct
       FROM user_progress WHERE user_id = ? AND topic IS NOT NULL
       GROUP BY subject, topic HAVING COUNT(*) >= 2
       ORDER BY (SUM(CASE WHEN is_correct THEN 1 ELSE 0 END)::float / COUNT(*)) ASC
       LIMIT 5`,
      [user_id]
    );
    const weakTopics = weakRows.map(r => ({
      subject: r.subject, topic: r.topic,
      pct: Math.round((Number(r.correct) / Number(r.total)) * 100),
    }));

    res.json({ subjects, weakTopics });
  } catch (e: any) {
    console.error("progress error:", e?.message);
    res.json({ subjects: [], weakTopics: [] });
  }
});

app.post("/api/whatsapp/message", async (req, res) => {
  const { user_id, user_message } = req.body;
  if (!db) return res.status(500).json({ error: "DB missing" });
  try {
    const messageUpper = user_message.trim().toUpperCase();
    if (messageUpper.startsWith("JOIN")) {
      const searchTerm = user_message.trim().substring(4).trim();
      if (!searchTerm) {
        return res.json({ message: "Please specify a school name or referral code." });
      }

      // Try to find school by referral code, name, or slug
      let school = await db.get("SELECT * FROM schools WHERE referral_code = ?", [searchTerm.toUpperCase()]);
      
      if (!school) {
        school = await db.get("SELECT * FROM schools WHERE school_name = ?", [searchTerm]);
      }

      if (!school) {
        const slug = searchTerm.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        school = await db.get("SELECT * FROM schools WHERE school_slug = ?", [slug]);
      }

      if (school) {
        await db.run("UPDATE users SET schoolId = ? WHERE uid = ?", [school.school_id, user_id]);
        return res.json({ message: `Welcome to ExamPLE! Powered by ${school.school_name} 🏫` });
      }
    }
    res.json({ message: "Command not recognized. Please type JOIN followed by your school code or name." });
  } catch (err) { res.status(500).json({ error: "WhatsApp failed" }); }
});

app.get("/api/schools/by-slug/:slug", async (req, res) => {
  const { slug } = req.params;
  if (!db) return res.status(500).json({ error: "DB missing" });
  try {
    const school = await db.get("SELECT school_id, school_name, school_slug, referral_code FROM schools WHERE school_slug = ?", [slug]);
    if (school) res.json(school);
    else res.status(404).json({ error: "School not found" });
  } catch (err) { res.status(500).json({ error: "Query failed" }); }
});

app.post("/school-login", async (req, res) => {
  const { school_slug, password } = req.body;
  if (!db) return res.status(500).json({ error: "DB missing" });
  try {
    const school = await db.get("SELECT * FROM schools WHERE school_slug = ?", [school_slug]);
    if (school && school.password === password) {
      res.json({ success: true });
    } else {
      res.status(401).json({ error: "Invalid password" });
    }
  } catch (err) { res.status(500).json({ error: "Login failed" }); }
});

app.post("/school-dashboard", async (req, res) => {
  const { school_slug } = req.body;
  if (!db) return res.status(500).json({ error: "DB missing" });
  try {
    const school = await db.get("SELECT * FROM schools WHERE school_slug = ?", [school_slug]);
    if (!school) return res.status(404).json({ error: "School not found" });
    
    const withdrawals = await db.all("SELECT * FROM withdrawals WHERE school_id = ?", [school.school_id]);
    
    // Approximate active users as users who joined this school
    const usersRes = await db.get("SELECT COUNT(*) as count FROM users WHERE schoolId = ?", [school.school_id]);

    res.json({
      ...school,
      total_students: school.total_students || 0,
      active_users: usersRes?.count || 0,
      withdrawals
    });
  } catch (err) { res.status(500).json({ error: "Dashboard failed" }); }
});

app.post("/request-withdrawal", async (req, res) => {
  const { school_id, amount } = req.body;
  if (!db || !school_id || !amount) return res.status(400).json({ error: "Missing data" });
  try {
    const school = await db.get("SELECT total_earnings FROM schools WHERE school_id = ?", [school_id]);
    if (!school || school.total_earnings < amount) {
      return res.status(400).json({ error: "Insufficient balance" });
    }
    
    const withdrawal_id = `wd_${Math.random().toString(36).substring(2, 9)}`;
    await db.run("INSERT INTO withdrawals (id, school_id, amount, status, timestamp) VALUES (?, ?, ?, ?, ?)", [
      withdrawal_id, school_id, amount, 'pending', new Date().toISOString()
    ]);
    
    // Deduct from school balance
    await db.run("UPDATE schools SET total_earnings = total_earnings - ? WHERE school_id = ?", [amount, school_id]);
    
    // Log activity
    await db.run("INSERT INTO activity (type, details, timestamp) VALUES (?, ?, ?)", [
      'withdrawal', 
      JSON.stringify({ school_id, amount, withdrawal_id }), 
      new Date().toISOString()
    ]);

    res.json({ message: "Withdrawal request submitted successfully" });
  } catch (err) { res.status(500).json({ error: "Withdrawal failed" }); }
});

// --- ADMIN ENDPOINTS ---
const ADMIN_SECRET = process.env.ADMIN_SECRET || "exam-admin-2026";

const authenticateAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader === `Bearer ${ADMIN_SECRET}`) {
    next();
  } else {
    res.status(401).json({ error: "Unauthorized" });
  }
};

app.get("/admin/stats", authenticateAdmin, async (req, res) => {
  if (!db) return res.status(500).json({ error: "DB missing" });
  try {
    const userCount = await db.get("SELECT COUNT(*) as count FROM users");
    const schoolCount = await db.get("SELECT COUNT(*) as count FROM schools");
    const stats = await db.all("SELECT * FROM stats");
    
    // Calculate total revenue and withdrawals from stats or entities
    const totalRevenue = stats.find(s => s.key === 'total_revenue')?.value || 0;
    const totalWithdrawals = stats.find(s => s.key === 'total_withdrawals')?.value || 0;

    res.json({
      totalUsers: userCount.count,
      totalSchools: schoolCount.count,
      totalRevenue,
      totalWithdrawals
    });
  } catch (err) { res.status(500).json({ error: "Stats failed" }); }
});

app.get("/admin/users", authenticateAdmin, async (req, res) => {
  if (!db) return res.status(500).json({ error: "DB missing" });
  try {
    const users = await db.all("SELECT * FROM users");
    const schools = await db.all("SELECT * FROM schools");
    
    const enrichedUsers = users.map(u => {
      const school = schools.find(s => s.school_id === u.schoolId);
      return {
        ...u,
        school_name: school ? school.school_name : "Private Student"
      };
    });
    
    res.json(enrichedUsers);
  } catch (err) { res.status(500).json({ error: "Users failed" }); }
});

app.get("/admin/schools", authenticateAdmin, async (req, res) => {
  if (!db) return res.status(500).json({ error: "DB missing" });
  try {
    const schools = await db.all("SELECT * FROM schools");
    res.json(schools);
  } catch (err) { res.status(500).json({ error: "Schools failed" }); }
});

app.get("/admin/withdrawals", authenticateAdmin, async (req, res) => {
  if (!db) return res.status(500).json({ error: "DB missing" });
  try {
    const withdrawals = await db.all("SELECT * FROM withdrawals");
    const schools = await db.all("SELECT * FROM schools");
    
    const enrichedWithdrawals = withdrawals.map(w => {
      const school = schools.find(s => s.school_id === w.school_id);
      return {
        ...w,
        school_name: school ? school.school_name : "Unknown School"
      };
    });
    
    res.json(enrichedWithdrawals);
  } catch (err) { res.status(500).json({ error: "Withdrawals failed" }); }
});

app.post("/admin/topup", authenticateAdmin, async (req, res) => {
  if (!db) return res.status(500).json({ error: "DB missing" });
  const { uid, credits } = req.body;
  if (!uid || typeof credits !== 'number' || credits <= 0) {
    return res.status(400).json({ error: "uid and a positive credits amount are required" });
  }
  try {
    const user = await db.get("SELECT uid, credits, displayName FROM users WHERE uid = ?", [uid]);
    if (!user) return res.status(404).json({ error: "User not found" });
    await db.run("UPDATE users SET credits = credits + ? WHERE uid = ?", [credits, uid]);
    const updated = await db.get("SELECT uid, credits, displayName FROM users WHERE uid = ?", [uid]);
    res.json({ success: true, uid, creditsBefore: user.credits, creditsAfter: updated.credits, displayName: updated.displayName });
  } catch (err) { res.status(500).json({ error: "Top-up failed" }); }
});

app.get("/admin/activity", authenticateAdmin, async (req, res) => {
  if (!db) return res.status(500).json({ error: "DB missing" });
  try {
    const activity = await db.all("SELECT * FROM activity ORDER BY timestamp DESC LIMIT 50");
    res.json(activity);
  } catch (err) { res.status(500).json({ error: "Activity failed" }); }
});

app.post("/api/withdrawals/mark-paid", authenticateAdmin, async (req, res) => {
  const { withdrawal_id } = req.body;
  if (!db || !withdrawal_id) return res.status(400).json({ error: "Missing data" });
  try {
    await db.run("UPDATE withdrawals SET status = 'paid' WHERE id = ?", [withdrawal_id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Mark paid failed" }); }
});

// --- SUPPORT CHAT ENDPOINT ---
app.post("/api/support/chat", async (req, res) => {
  const { history, message } = req.body;

  // --- Scripted answers for common questions (always accurate, no AI drift) ---
  // More specific patterns must come before general ones
  const SCRIPTED: { pattern: RegExp; answer: string }[] = [
    {
      pattern: /\bschool.*regist|\bregist.*school|\bschool.*portal|\bown.*portal|\bpartner\b/i,
      answer: `Schools can register on ExamPLE to get their own branded student portal.\n\nBenefits for schools:\n- A unique school link to share with students (exam-ple.xyz/your-school)\n- A referral code to onboard students\n- A dashboard to monitor student activity and performance\n- 40% of subscription revenue from your students\n\nTo register, tap the Settings icon inside the app and select "Register Your School".`
    },
    {
      pattern: /\bschool.*dashboard|\bdashboard.*login|\bschool.*log.?in|\blog.?in.*school|\baccess.*dashboard|\bschool.*account\b/i,
      answer: `To access your school dashboard:\n\n1. Visit exam-ple.xyz\n2. Tap the Settings icon (gear icon) in the top-right corner of the app\n3. Scroll down and tap "School Login"\n4. Enter your school's unique slug (the short name in your school link, e.g. "kings-college" from exam-ple.xyz/kings-college)\n5. Enter your school password (set during registration)\n6. Tap "Login" to access your dashboard\n\nFrom the dashboard, you can view student activity, monitor learning progress, and manage your school account.\n\nIf you have forgotten your password, tap "Forgot Password?" on the school login screen.`
    },
    {
      pattern: /\bforgot.*school.*pass|\bschool.*forgot.*pass|\breset.*school.*pass|\bschool.*pass.*reset|\bschool.*password\b/i,
      answer: `To reset your school password:\n\n1. Tap the Settings icon in the top-right corner of the app\n2. Scroll to "School Login" and tap it\n3. Tap "Forgot Password?" below the login form\n4. Enter your school's referral code (provided when you registered)\n5. Enter and confirm your new password\n6. Tap "Reset Password"\n\nYour referral code was shared with you when your school was first registered. If you have lost it, please contact ExamPLE support for assistance.`
    },
    {
      pattern: /\bpast.?question|\bpast.?paper|\bprevious.*(question|exam)|\bold.*(question|exam)|\bquestion.*bank|\bpastq\b/i,
      answer: `The Past Question Bank lets you practise with real past exam questions from WAEC, NECO, and JAMB.\n\nHow to use it:\n1. Tap the "Exam Mode" tab at the bottom of the app\n2. Switch the sub-tab at the top from "Practice Test" to "Past Questions"\n3. Select your subject\n4. Pick a year (2015 to 2024 available)\n5. Choose one of two modes:\n   - **Simulate Exam:** Timed, exam-condition experience — answers are hidden until you submit, just like the real thing\n   - **Similar to [Year]:** AI generates fresh questions in the style and difficulty of that year's paper\n6. Tap "Start" to begin\n\nYour score and performance are saved automatically to your Progress Tracker.`
    },
    {
      pattern: /\bpractice.*test|\bpractice.*mode|\bpractice.*exam|\bexam.*practice\b/i,
      answer: `Practice Test mode generates AI-powered exam questions tailored to your chosen subject and level.\n\nHow to use it:\n1. Tap the "Exam Mode" tab at the bottom of the app\n2. Make sure the "Practice Test" sub-tab is selected (it is the default)\n3. Enter your subject (e.g. Mathematics, Biology, Government)\n4. Select your exam type — WAEC, NECO, or JAMB\n5. Choose the number of questions (up to 20) and the time limit\n6. Tap "Start Exam"\n\nAt the end, you will see your score, a breakdown of correct and incorrect answers, and explanations for each question. Your results are saved to your Progress Tracker automatically.`
    },
    {
      pattern: /\bexam.*mode|\bhow.*exam|\bstart.*exam|\bexam.*tab|\bexam.*feature|\btimed.*exam\b/i,
      answer: `Exam Mode is where you practise under real exam conditions. It has two sub-modes:\n\n**Practice Test:**\nAI generates fresh questions for any subject you choose. Select your exam type (WAEC, NECO, or JAMB), the number of questions, and your time limit — then start immediately.\n\n**Past Questions:**\nPractise with real past exam questions. Pick a year between 2015 and 2024, then choose to either simulate the exact exam or get AI-generated questions in that year's style.\n\nTo get started, tap the "Exam Mode" tab at the bottom of the app.`
    },
    {
      pattern: /\bprogress|\btrack.*progress|\bperformance|\bweak.*topic|\bmy.*score|\bmy.*result|\bsubject.*score\b/i,
      answer: `The Progress Tracker shows you exactly how you are performing across all your subjects.\n\nWhat it displays:\n- **Subject scores:** Your average score for each subject you have practised\n- **Weak topics:** The specific topics within a subject where you need the most improvement\n- **Trend over time:** How your performance is changing as you study more\n\nHow to access it:\n1. Log into your ExamPLE account with your Student Code\n2. Tap the "Progress" tab at the bottom of the app\n\nYour tracker is updated automatically every time you complete an exam in Exam Mode. The more you practise, the more detailed your insights become.`
    },
    {
      pattern: /\bai tutor|\bask.*question|\btutor|\bchat.*tab|\bwhat.*can.*ask|\bhow.*tutor\b/i,
      answer: `The AI Tutor is ExamPLE's main learning feature — available 24 hours a day, 7 days a week.\n\nYou can:\n- **Ask any academic question** in any subject — Biology, Mathematics, English, Physics, Chemistry, Government, Literature, Economics, and more\n- **Get voice explanations** — tap the microphone icon to ask your question out loud and hear the answer read back to you\n- Receive step-by-step explanations written in a way that is easy to understand\n\nCredit usage:\n- Text question: 1 credit\n- Voice explanation: 2 credits\n\nTo use the AI Tutor, tap the "AI Tutor" tab at the bottom of the app after logging in.`
    },
    {
      pattern: /\bvoice|\baudio|\bspeak|\bmicrophone|\blisten\b/i,
      answer: `ExamPLE supports voice interactions in the AI Tutor.\n\nHow to use voice:\n1. Tap the "AI Tutor" tab\n2. Tap the microphone icon to speak your question\n3. The AI will process your question and read the answer back to you in audio\n\nVoice explanations cost 2 credits per interaction (compared to 1 credit for text questions). This is because voice uses additional AI processing to generate natural speech.\n\nVoice is great for studying while on the move or when you prefer to listen rather than read.`
    },
    {
      pattern: /\bjoin\b|\bsign.?up\b|\bget started\b|\bcreate.*(account|profile)\b/i,
      answer: `There are two ways to join ExamPLE:\n\n**Option 1 — Via your school:**\nIf your school uses ExamPLE, your school administrator will share a unique link (e.g. exam-ple.xyz/your-school-name). Visit that link and tap "Join" to be automatically connected to your school. Alternatively, open the Settings section inside the app and enter the referral code your school provided.\n\n**Option 2 — As an independent student:**\nYou do not need a school to use ExamPLE. Simply:\n1. Visit exam-ple.xyz\n2. Tap the green "Join" button at the top-right\n3. Select "New Student"\n4. Enter your name\n5. You will receive a unique 6-character Student Code immediately\n6. Save your code and begin learning\n\nNo school link or referral code is required for independent students.`
    },
    {
      pattern: /\bforgot\b.*code|lost.*code|recover.*code|find.*code|code.*lost|can.*t.*log.*in|cannot.*log/i,
      answer: `To recover your Student Code:\n\n1. On the login screen, tap "Returning Student"\n2. Tap "Lost your code?"\n3. Enter your full name\n   - If you joined independently: leave the school field blank\n   - If you joined through a school: also enter your school's slug (e.g. kings-college)\n4. Your code will be retrieved\n\nIf you are still unable to recover it, please contact your school administrator (if applicable) or reach out to ExamPLE support.`
    },
    {
      pattern: /\bcredit|\bhow.*work|\bunit|\bcharge|\bcost\b/i,
      answer: `Credits are the currency used across ExamPLE:\n\n- **Text question (AI Tutor):** 1 credit\n- **Voice explanation (AI Tutor):** 2 credits\n- **Exam Mode:** 1 credit per question (e.g. a 10-question exam costs 10 credits, a 20-question exam costs 20 credits)\n- **Submitting and marking your exam:** Free\n- **Progress Tracker:** Free\n\nNew students receive free starter credits when they join. Additional credits are purchased through one of the plans below:\n\n- Basic: ₦2,500 for 50 credits (30 days)\n- Premium: ₦4,500 for 100 credits (30 days)\n- Max: ₦6,500 for 250 credits (30 days)\n- Top-up: ₦500 for 10 credits (pay as you go)\n\nAll payments are processed securely via Paystack.`
    },
    {
      pattern: /\bpric|\bplan|\bpay|\bsubscri|\bhow much\b/i,
      answer: `ExamPLE offers the following credit plans, all paid securely via Paystack:\n\n- **Basic:** ₦2,500 for 50 credits (valid 30 days)\n- **Premium:** ₦4,500 for 100 credits (valid 30 days)\n- **Max:** ₦6,500 for 250 credits (valid 30 days)\n- **Top-up:** ₦500 for 10 credits (pay as you go, no expiry pressure)\n\nHow credits are used:\n- AI Tutor text question: 1 credit\n- AI Tutor voice explanation: 2 credits\n- Exam Mode: 1 credit per question when starting an exam\n- Submitting and marking: free\n- Progress Tracker: free\n\nTo purchase, tap the credit/buy button inside the app while logged in.`
    },
    {
      pattern: /\bstudent.*code\b|\bwhat.*code|\bcode.*mean|\bmy.*code\b/i,
      answer: `Your Student Code is a unique 6-character code assigned to you when you join ExamPLE (for example: AB3X7K).\n\nIt is how you log back into your account from any device — similar to a password.\n\nYou can find your code at any time by opening the Settings panel inside the app. Please save it somewhere safe, as losing it may make it harder to recover your account.`
    },
    {
      pattern: /\bwhat.*feature|\bwhat.*can.*do|\bwhat.*include|\bwhat.*offer|\btell.*me.*about\b/i,
      answer: `ExamPLE is an AI-powered exam preparation platform built specifically for Nigerian students. Here is what it includes:\n\n**AI Tutor**\nAsk any academic question — in text or by voice — and get clear, step-by-step explanations instantly. Available 24/7.\n\n**Exam Mode**\nTwo ways to practise:\n- *Practice Test:* AI-generated questions for any subject, exam type (WAEC, NECO, JAMB), and time limit you choose\n- *Past Question Bank:* Real past questions from 2015 to 2024 — simulate the exact exam or practise questions in that year's style\n\nExam Mode costs 1 credit per question to start. Submitting and marking is free.\n\n**Progress Tracker**\nSee your scores per subject and your weakest topics so you know exactly where to focus your revision. Free to access.\n\n**Payments**\nSecure credit purchases via Paystack. Plans start from ₦500.\n\nVisit exam-ple.xyz to get started.`
    },
  ];

  for (const { pattern, answer } of SCRIPTED) {
    if (pattern.test(message)) {
      return res.json({ text: answer });
    }
  }

  // --- AI fallback for all other questions ---
  const SYSTEM_INSTRUCTION = `You are the ExamPLE Support Assistant. ExamPLE is an AI-powered exam preparation platform for Nigerian students (Primary, Secondary, WAEC, NECO, JAMB).

Respond in professional, clear English only. Do not use slang, pidgin, or informal phrases.

Key facts about ExamPLE:

FEATURES:
1. AI Tutor — the main chat tab. Students ask any academic question by text (1 credit) or voice/microphone (2 credits) and receive instant AI explanations. Available 24/7.
2. Exam Mode — two sub-modes accessible via a tab switcher:
   a. Practice Test: AI generates fresh exam questions. Student picks subject, exam type (WAEC/NECO/JAMB), number of questions, and time limit.
   b. Past Question Bank: Real past exam questions from 2015 to 2024. Student picks subject and year. Two options: "Simulate Exam" (timed, answers hidden until submit) or "Similar to [Year]" (AI generates questions in that year's style). Exam Mode is free — no credits needed.
3. Progress Tracker — tracks subject scores and weak topics automatically after every exam. Free to access. Requires login.

ACCOUNT:
- Students join at exam-ple.xyz — tap Join, select New Student, enter name, receive a 6-character Student Code instantly.
- The Student Code is their login credential on any device. It must be saved safely.
- Students can also join via a school link or referral code (optional).
- Lost code recovery: tap "Returning Student" then "Lost your code?" on the login screen.

CREDITS & PRICING:
- Credits: AI Tutor text = 1 credit, AI Tutor voice = 2 credits, Exam Mode = 1 credit per question to start (submitting/marking is free), Progress Tracker = free.
- New students receive free starter credits.
- Plans (paid via Paystack): Basic ₦2,500/50 credits (30 days), Premium ₦4,500/100 credits (30 days), Max ₦6,500/250 credits (30 days), Top-up ₦500/10 credits (no expiry).

SCHOOLS:
- Schools register to get a branded portal (exam-ple.xyz/school-slug), referral code, student activity dashboard, and 40% of student subscription revenue.
- School login: Settings icon → School Login → enter slug + password.
- School password reset: Settings → School Login → Forgot Password → enter referral code.

Keep answers concise and factual.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      config: { systemInstruction: SYSTEM_INSTRUCTION },
      contents: [
        ...history.map((m: any) => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.content }],
        })),
        { role: 'user', parts: [{ text: message }] }
      ],
    });

    res.json({ text: response.text });
  } catch (err) {
    console.error("Support chat error:", err);
    res.status(500).json({ error: "Support chat failed" });
  }
});

// --- 7. API STATUS ---
app.get("/", (req, res) => {
  res.json({ 
    message: "ExamPLE API is online", 
    status: "ready",
    endpoints: ["/ask-question", "/get-audio", "/register-school", "/school-login"] 
  });
});

// --- 8. GLOBAL ERROR HANDLING ---
process.on("uncaughtException", (err) => { console.error("Uncaught Exception:", err); });
process.on("unhandledRejection", (err) => { console.error("Unhandled Rejection:", err); });

// --- 9. SERVER START (AT THE VERY END) ---
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 ExamPLE running on port ${PORT}`);
});
