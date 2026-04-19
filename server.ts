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
  verify: (req: any, res, buf) => { req.rawBody = buf; }
}));
app.set("trust proxy", 1);

// --- 4. SAFE DATABASE INITIALIZATION (Non-blocking) ---
let db = null;
getDb()
  .then(database => {
    db = database;
    console.log("✅ Database connected in background");
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
  if (!db) return 10;
  try {
    const user = await db.get("SELECT credits, expiry_date FROM users WHERE uid = ?", [userId]);
    if (!user) return 10;
    
    // Check for expiration
    if (user.expiry_date) {
      const expiry = new Date(user.expiry_date);
      if (expiry < new Date()) {
        await db.run("UPDATE users SET credits = 0, expiry_date = NULL WHERE uid = ?", [userId]);
        return 0;
      }
    }
    
    return user.credits;
  } catch (e) { return 10; }
};

// --- 6. API ENDPOINTS ---

app.post("/api/auth/simple", async (req, res) => {
  const { uid, returnOnly, displayName } = req.body;
  if (!uid || !db) return res.status(400).json({ error: "Missing data" });
  try {
    const user = await db.get("SELECT * FROM users WHERE uid = ?", [uid]);
    if (!user) {
      if (returnOnly) return res.status(404).json({ error: "Student code not found" });
      await db.run("INSERT INTO users (uid, credits, displayName) VALUES (?, ?, ?)", [uid, 10, displayName || null]);
    } else if (displayName && !user.displayName) {
      await db.run("UPDATE users SET displayName = ? WHERE uid = ?", [displayName, uid]);
    }
    res.json(await db.get("SELECT * FROM users WHERE uid = ?", [uid]));
  } catch (err) { res.status(500).json({ error: "Auth failed" }); }
});

// School forgot password — verify via referral code
app.post("/api/schools/reset-password", async (req, res) => {
  const { referral_code, new_password } = req.body;
  if (!referral_code || !new_password || !db) return res.status(400).json({ error: "Missing data" });
  if (new_password.length < 4) return res.status(400).json({ error: "Password too short" });
  try {
    const school = await db.get("SELECT * FROM schools WHERE UPPER(TRIM(referral_code)) = UPPER(TRIM(?))", [referral_code]);
    if (!school) return res.status(404).json({ error: "Referral code not found" });
    await db.run("UPDATE schools SET password = ? WHERE school_id = ?", [new_password, school.school_id]);
    res.json({ success: true, school_slug: school.school_slug });
  } catch (err) { res.status(500).json({ error: "Reset failed" }); }
});

// Student code recovery — find by name + school slug
app.post("/api/students/recover-code", async (req, res) => {
  const { displayName, school_slug } = req.body;
  if (!displayName || !school_slug || !db) return res.status(400).json({ error: "Missing data" });
  try {
    const school = await db.get("SELECT school_id FROM schools WHERE school_slug = ?", [school_slug.toLowerCase().trim()]);
    if (!school) return res.status(404).json({ error: "School not found" });
    const student = await db.get(
      "SELECT uid, displayName FROM users WHERE LOWER(TRIM(displayName)) = LOWER(TRIM(?)) AND schoolId = ?",
      [displayName, school.school_id]
    );
    if (!student) return res.status(404).json({ error: "No student found with that name at this school" });
    const code = student.uid.replace("user_", "").toUpperCase();
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

async function creditUserPayment(userId: string, creditAmount: number, payAmount: number) {
  if (!db || !userId || !creditAmount) return;
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + 30);
  await db.run("UPDATE users SET credits = credits + ?, expiry_date = ? WHERE uid = ?", [creditAmount, expiry.toISOString(), userId]);
  const user = await db.get("SELECT schoolId FROM users WHERE uid = ?", [userId]);
  if (user?.schoolId) {
    await db.run("UPDATE schools SET total_earnings = total_earnings + ? WHERE school_id = ?", [payAmount * 0.4, user.schoolId]);
  }
  await db.run("INSERT INTO activity (type, details, timestamp) VALUES (?, ?, ?)", [
    'payment', JSON.stringify({ userId, amount: payAmount, credits: creditAmount }), new Date().toISOString()
  ]);
}

app.get("/payment-success", async (req, res) => {
  const { demo, userId, credits, amount, reference, trxref } = req.query;
  const ref = (reference || trxref) as string;

  // Real Paystack payment — verify with API
  if (ref && PAYSTACK_SECRET && db) {
    try {
      const verify = await axios.get(`https://api.paystack.co/transaction/verify/${ref}`, {
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` }
      });
      const txn = verify.data?.data;
      if (txn?.status === "success") {
        const meta = txn.metadata || {};
        await creditUserPayment(meta.userId, Number(meta.credits), txn.amount / 100);
      }
    } catch (_) {}
  }

  // Demo mode
  if (demo === "true") {
    await creditUserPayment(userId as string, Number(credits), Number(amount));
  }

  const distPath = path.join(process.cwd(), "dist");
  res.sendFile(path.join(distPath, "index.html"));
});

// Paystack webhook (server-to-server)
app.post("/api/payments/webhook", async (req: any, res) => {
  const hash = require("crypto").createHmac("sha512", PAYSTACK_SECRET || "").update(req.rawBody || "").digest("hex");
  if (hash !== req.headers["x-paystack-signature"]) return res.status(401).send("Invalid signature");
  const event = req.body;
  if (event.event === "charge.success" && db) {
    const txn = event.data;
    const meta = txn.metadata || {};
    await creditUserPayment(meta.userId, Number(meta.credits), txn.amount / 100);
  }
  res.sendStatus(200);
});

app.post("/ask-question", async (req, res) => {
  const { user_id, questionText, isVoice, level, subject, usePidgin } = req.body;
  const cost = isVoice ? 2 : 1;
  try {
    const credits = await getUserCredits(user_id);
    if (credits < cost) return res.status(403).json({ error: "Not enough credits" });
    res.setHeader('Content-Type', 'text/event-stream');
    const levelCtx = level || "Secondary";
    const subjectCtx = subject ? ` in ${subject}` : "";
    const langNote = usePidgin ? " Use Nigerian Pidgin English." : "";
    const levelGuide = levelCtx === "Primary"
      ? "You teach Nigerian Primary school pupils (Basic 1–6) and help them prepare for the Common Entrance exam. Use simple, clear language a child can understand."
      : levelCtx === "Exam"
      ? "You help Nigerian students prepare for WAEC, NECO, JAMB, and Post-UTME exams. Focus on past question patterns, correct answers, and exam techniques."
      : "You teach Nigerian Secondary school students (JSS1–SS3) following the Nigerian national curriculum.";
    const systemInstruction = `You are ExamPLE, an AI tutor for Nigerian students${subjectCtx}. ${levelGuide}
Give clear, correct, well-explained answers. Always provide the answer, not just an explanation.
IMPORTANT: Never use LaTeX or dollar signs for math (e.g. never write $x^2$). Write math in plain text (e.g. x squared or x^2).${langNote}`;
    const stream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      config: { systemInstruction },
      contents: [{ role: "user", parts: [{ text: questionText }] }],
    });
    for await (const chunk of stream) { if (chunk.text) res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`); }
    if (db) await db.run("UPDATE users SET credits = MAX(0, credits - ?) WHERE uid = ?", [cost, user_id]);
    res.write(`data: [DONE]\n\n`);
    res.end();
  } catch (e: any) { 
    console.error("ask-question error:", e?.message);
    res.write(`data: ${JSON.stringify({ error: "AI unavailable" })}\n\n`);
    res.end(); 
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
    // Deduct 1 unit for audio explanation if user_id is provided
    if (user_id && db) {
      const credits = await getUserCredits(user_id);
      if (credits < 1) return res.status(403).json({ error: "Not enough credits for audio" });
      await db.run("UPDATE users SET credits = MAX(0, credits - 1) WHERE uid = ?", [user_id]);
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
const ADMIN_SECRET = "exam-admin-2026";

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

app.get("/admin/activity", authenticateAdmin, async (req, res) => {
  if (!db) return res.status(500).json({ error: "DB missing" });
  try {
    const activity = await db.all("SELECT * FROM activity ORDER BY timestamp DESC LIMIT 50");
    res.json(activity);
  } catch (err) { res.status(500).json({ error: "Activity failed" }); }
});

app.post("/admin/withdrawals/mark-paid", authenticateAdmin, async (req, res) => {
  const { withdrawal_id } = req.body;
  if (!db || !withdrawal_id) return res.status(400).json({ error: "Missing data" });
  try {
    await db.run("UPDATE withdrawals SET status = 'paid' WHERE id = ?", [withdrawal_id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Mark paid failed" }); }
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
// Support chatbot — handles platform queries for students and schools
app.post("/api/support/chat", async (req, res) => {
  const { message, history = [] } = req.body;
  if (!message) return res.status(400).json({ error: "Missing message" });
  const systemInstruction = `You are ExamPLE Support Assistant — a friendly, helpful chatbot for the ExamPLE AI tutoring platform used by Nigerian students and schools.

PLATFORM KNOWLEDGE:
## What is ExamPLE?
ExamPLE is an AI-powered educational platform for Nigerian students. It provides AI tutoring for Primary school, Secondary school, and exam preparation (WAEC, NECO, JAMB, Common Entrance). Schools can sign up and earn 40% revenue from every subscription their students buy.

## How Students Join
- Visit exam-ple.vercel.app
- Click "Start Learning" or "Login"
- Enter your name — a unique 6-character Student Code is generated (e.g. A1B2C3)
- SAVE this code — you need it to log back in on any device
- If your school gave you a referral link (e.g. exam-ple.vercel.app/kings-college), open that link first before logging in so your account links to the school

## Student Login / Returning Student
- Click "Returning Student" on the login screen
- Enter your 6-character Student Code
- If you forgot your code: click "Lost your code?" → enter the name you registered with and your school's URL slug (e.g. kings-college) → your code will be shown

## How Schools Join
- Visit exam-ple.vercel.app and go to "Register School"
- Enter your school name and create a password
- You get a unique school dashboard link (e.g. exam-ple.vercel.app/kings-college/dashboard) and a referral code
- Share your school link with students so their subscriptions are linked to your school
- Schools earn 40% of every subscription payment from their students

## School Login / Forgot Password
- Visit your school dashboard link (exam-ple.vercel.app/YOUR-SCHOOL-SLUG/dashboard)
- Enter your admin password
- If you forgot your password: click "Forgot password?" on the login page → enter your Referral Code (given at registration) → set a new password

## Credit Plans & Pricing
- Basic: ₦2,500 → 50 credits (30 days)
- Premium: ₦4,500 → 100 credits (30 days)
- Max: ₦6,500 → 250 credits (30 days)
- Top-up: ₦500 → 10 credits (no expiry change)
New students get 10 free credits to start.

## How to Make Payment / Buy Credits
1. Log in as a student
2. Click the "Buy Credits" or credits button
3. Choose a plan
4. You'll be redirected to Paystack (secure Nigerian payment gateway)
5. Pay with card, bank transfer, or USSD
6. Credits are added to your account automatically after payment

## How Credits Work
- Text questions cost 1 credit each
- Voice questions cost 2 credits each
- Credits expire 30 days after purchase (Top-up credits don't reset the timer)
- You can see your credit balance at the top of the screen

## How to Ask Questions (Navigation)
- Type your question in the text box at the bottom
- Choose your Level (Primary / Secondary / Exam Prep) from the dropdown
- Enter your Subject (e.g. Math, Biology)
- Click the send button or press Enter
- For voice: tap the microphone icon to ask by voice
- Click "Listen to Explanation" on any answer to hear it read aloud

## School Dashboard Features
- View total students, total earnings, and withdrawal history
- Request withdrawals (minimum ₦5,000)
- Share your school referral link with students

INSTRUCTIONS:
- Be friendly, clear, and concise
- If someone asks about a specific problem, guide them step by step
- If you don't know something specific, direct them to contact the ExamPLE admin
- Always respond in the same language the user writes in (English or Pidgin)
- Never make up information not in the knowledge base above`;

  try {
    const contents = [
      ...history.map((h: any) => ({ role: h.role, parts: [{ text: h.content }] })),
      { role: "user", parts: [{ text: message }] }
    ];
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      config: { systemInstruction },
      contents
    });
    res.json({ reply: response.text || "I'm not sure about that. Please contact support." });
  } catch (err) {
    res.status(500).json({ error: "Support unavailable" });
  }
});

process.on("uncaughtException", (err) => { console.error("Uncaught Exception:", err); });
process.on("unhandledRejection", (err) => { console.error("Unhandled Rejection:", err); });

// --- 9. SERVER START (AT THE VERY END) ---
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 ExamPLE running on port ${PORT}`);
});
