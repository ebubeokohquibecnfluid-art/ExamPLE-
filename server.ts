import express from "express";
import axios from "axios";
import cors from "cors";
import { createHmac, timingSafeEqual } from "crypto";
import { GoogleGenAI, Modality } from "@google/genai";
import { getDb } from "./src/db.js";

const app = express();
const PORT = Number(process.env.PORT) || 5000;

// --- 1. CORS CONFIGURATION ---
// Allow requests from Vercel frontend and any configured APP_URL
const allowedOrigins = [
  process.env.APP_URL,
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, etc.) or from allowed origins
    if (!origin) return callback(null, true);
    // Allow any vercel.app domain and any explicitly configured origin
    if (
      origin.endsWith('.vercel.app') ||
      allowedOrigins.includes(origin)
    ) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

// --- 2. DEDICATED HEALTH CHECK ---
app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

// --- 3. EXPRESS CONFIGURATION ---
app.use(express.json({ limit: "50mb" }));
app.set("trust proxy", 1);

// --- 4. SAFE DATABASE INITIALIZATION (Non-blocking) ---
let db: any = null;
getDb()
  .then(database => {
    db = database;
    console.log("✅ Database connected");
    // Migrate existing tables to add new columns if missing
    try { db.prepare("ALTER TABLE users ADD COLUMN expiry_date TEXT").run(); } catch (_) {}
  })
  .catch(err => {
    console.error("❌ DB Connection Error:", err);
  });

// --- 5. ENVIRONMENT VARIABLES ---
const apiKey = (process.env.REAL_GEMINI_KEY || process.env.GEMINI_API_KEY || "").trim();
if (!apiKey) {
  console.error("❌ Missing Gemini API Key");
} else {
  console.log(`✅ Gemini API Key loaded (starts with: ${apiKey.substring(0, 6)}...)`);
}

const ai = new GoogleGenAI({ apiKey });
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

// Pricing: name → Naira price
const PLAN_PRICES: Record<string, number> = { 'Basic': 2500, 'Premium': 4500, 'Max': 6500, 'Top-up': 500 };
// Pricing: name → units granted
const PLAN_UNITS: Record<string, number> = { 'Basic': 50, 'Premium': 100, 'Max': 250, 'Top-up': 10 };

// Helper for credits — checks expiry date
const getUserCredits = (userId: string): number => {
  if (!db) return 10;
  try {
    const user = db.prepare("SELECT credits, expiry_date FROM users WHERE uid = ?").get(userId) as any;
    if (!user) return 10;
    // Check for expiration (non-top-up credits expire after 30 days)
    if (user.expiry_date) {
      const expiry = new Date(user.expiry_date);
      if (expiry < new Date()) {
        db.prepare("UPDATE users SET credits = 0, expiry_date = NULL WHERE uid = ?").run(userId);
        return 0;
      }
    }
    return user.credits;
  } catch (e) { return 10; }
};

// --- 6. API ENDPOINTS ---

app.post("/api/auth/simple", (req, res) => {
  const { uid } = req.body;
  if (!uid || !db) return res.status(400).json({ error: "Missing data" });
  try {
    const user = db.prepare("SELECT * FROM users WHERE uid = ?").get(uid) as any;
    if (!user) db.prepare("INSERT INTO users (uid, credits) VALUES (?, ?)").run(uid, 10);
    res.json(db.prepare("SELECT * FROM users WHERE uid = ?").get(uid));
  } catch (err) { res.status(500).json({ error: "Auth failed" }); }
});

app.post("/api/payments/initialize", async (req, res) => {
  const { email, amount, userId, planName } = req.body;
  const units = PLAN_UNITS[planName] || 0;
  const frontendUrl = process.env.APP_URL || process.env.FRONTEND_URL || '';
  // Demo Mode check
  if (PAYSTACK_SECRET === "sk_test_examPLE_demo_key_999") {
    return res.json({ status: true, data: { authorization_url: `${frontendUrl}/payment-success?demo=true&userId=${userId}&credits=${units}&amount=${amount}&planName=${planName}` } });
  }
  if (!PAYSTACK_SECRET) return res.status(500).json({ error: "Paystack not configured" });
  try {
    const response = await axios.post("https://api.paystack.co/transaction/initialize", {
      email, amount: amount * 100,
      metadata: { userId, planName, credits: units, amount },
      callback_url: `${frontendUrl}/payment-success`
    }, { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } });
    res.json(response.data);
  } catch (err) { res.status(500).json({ error: "Payment failed" }); }
});

// Payment success: handles Paystack webhook / redirect — grants credits, sets expiry, 40% school commission
app.get("/payment-success", (req: any, res: any) => {
  const { demo, userId, credits, amount, planName } = req.query;
  const creditAmount = Number(credits);
  const payAmount = Number(amount);
  if (demo === "true" && userId && creditAmount && db) {
    const isTopUp = planName === 'Top-up';
    // Set 30-day expiry only for non-Top-up plans
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 30);
    const expiryStr = isTopUp ? null : expiry.toISOString();
    if (expiryStr) {
      db.prepare("UPDATE users SET credits = credits + ?, expiry_date = ? WHERE uid = ?").run(creditAmount, expiryStr, userId);
    } else {
      db.prepare("UPDATE users SET credits = credits + ? WHERE uid = ?").run(creditAmount, userId);
    }
    // 40% school commission on payment
    if (payAmount > 0) {
      const user = db.prepare("SELECT schoolId FROM users WHERE uid = ?").get(userId) as any;
      if (user?.schoolId) {
        const schoolComm = payAmount * 0.4;
        db.prepare("UPDATE schools SET total_earnings = total_earnings + ?, total_students = (SELECT COUNT(*) FROM users WHERE schoolId = schools.school_id) WHERE school_id = ?").run(schoolComm, user.schoolId);
        console.log(`💰 School commission: ₦${schoolComm} to school ${user.schoolId}`);
      }
    }
    console.log(`✅ Payment success: ${creditAmount} units → user ${userId}`);
  }
  // Redirect back to the frontend
  const frontendUrl = process.env.APP_URL || process.env.FRONTEND_URL || '/';
  res.redirect(frontendUrl);
});

app.post("/ask-question", async (req, res) => {
  const { user_id, questionText, isVoice } = req.body;
  const cost = isVoice ? 2 : 1;
  const MODELS = ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash-lite-001"];
  try {
    const credits = getUserCredits(user_id);
    if (credits < cost) return res.status(403).json({ error: "Not enough units" });
    res.setHeader('Content-Type', 'text/event-stream');
    console.log(`📨 Question from ${user_id}: ${questionText?.substring(0, 50)}`);
    let stream: any = null;
    let usedModel = "";
    for (const model of MODELS) {
      try {
        stream = await ai.models.generateContentStream({
          model,
          contents: [{ role: "user", parts: [{ text: questionText }] }],
        });
        usedModel = model;
        break;
      } catch (modelErr: any) {
        console.warn(`⚠️ ${model} failed, trying next...`);
        continue;
      }
    }
    if (!stream) throw new Error("All models unavailable");
    let chunkCount = 0;
    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) {
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
        chunkCount++;
      }
    }
    console.log(`✅ Streamed ${chunkCount} chunks via ${usedModel} for ${user_id}`);
    if (db && user_id) {
      // Ensure row exists, then deduct — handles fresh DB after restarts
      db.prepare("INSERT OR IGNORE INTO users (uid, credits) VALUES (?, 10)").run(user_id);
      const result = db.prepare("UPDATE users SET credits = MAX(0, credits - ?) WHERE uid = ?").run(cost, user_id);
      console.log(`💳 Deducted ${cost} unit(s) from ${user_id} (rows updated: ${result.changes})`);
    }
    res.write(`data: [DONE]\n\n`);
    res.end();
  } catch (e: any) {
    console.error("❌ ask-question error:", e?.message || e);
    res.write(`data: ${JSON.stringify({ text: "Sorry, the AI is very busy right now. Please try again in a moment!" })}\n\n`);
    res.write(`data: [DONE]\n\n`);
    res.end();
  }
});

app.post("/register-school", (req, res) => {
  const { school_name, password } = req.body;
  if (!school_name || !password || !db) return res.status(400).json({ error: "Missing data" });
  try {
    const school_slug = school_name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const school_id = `sch_${Math.random().toString(36).substring(2, 9)}`;
    const referral_code = Math.random().toString(36).substring(2, 8).toUpperCase();
    db.prepare("INSERT INTO schools (school_id, school_name, school_slug, referral_code, password) VALUES (?, ?, ?, ?, ?)").run(school_id, school_name, school_slug, referral_code, password);
    res.json({ school_name, school_id, school_slug, referral_code });
  } catch (err) { res.status(500).json({ error: "Registration failed" }); }
});

app.post("/school-login", (req, res) => {
  const { school_slug, password } = req.body;
  if (!school_slug || !password || !db) return res.status(400).json({ error: "Missing data" });
  try {
    const school = db.prepare("SELECT password FROM schools WHERE school_slug = ?").get(school_slug) as any;
    if (!school) return res.status(404).json({ error: "School not found" });
    if (school.password !== password) return res.status(401).json({ error: "Invalid password" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Login failed" });
  }
});

app.post("/school-dashboard", (req, res) => {
  const { school_slug } = req.body;
  if (!school_slug || !db) return res.status(400).json({ error: "Missing data" });
  try {
    const school = db.prepare("SELECT school_id, school_name, school_slug, referral_code, total_students, total_earnings FROM schools WHERE school_slug = ?").get(school_slug) as any;
    if (!school) return res.status(404).json({ error: "School not found" });
    // Live student count from users table
    const studentRow = db.prepare("SELECT COUNT(*) as count FROM users WHERE schoolId = ?").get(school.school_id) as any;
    const student_count = studentRow?.count || 0;
    // Update total_students if changed
    if (student_count !== school.total_students) {
      db.prepare("UPDATE schools SET total_students = ? WHERE school_id = ?").run(student_count, school.school_id);
      school.total_students = student_count;
    }
    // Recent withdrawals
    const withdrawals = db.prepare("SELECT * FROM withdrawals WHERE school_id = ? ORDER BY timestamp DESC LIMIT 10").all(school.school_id);
    res.json({ ...school, student_count, withdrawals });
  } catch (err) {
    console.error("❌ school-dashboard error:", err);
    res.status(500).json({ error: "Failed to load dashboard" });
  }
});

app.post("/request-withdrawal", (req, res) => {
  const { school_id, amount } = req.body;
  if (!school_id || !amount || !db) return res.status(400).json({ error: "Missing data" });
  try {
    const school = db.prepare("SELECT * FROM schools WHERE school_id = ?").get(school_id) as any;
    if (!school) return res.status(404).json({ error: "School not found" });
    if (amount < 5000) return res.status(400).json({ error: "Minimum withdrawal is ₦5,000" });
    if (amount > school.total_earnings) return res.status(400).json({ error: "Insufficient balance" });
    const id = `wd_${Math.random().toString(36).substring(2, 10)}`;
    db.prepare("INSERT INTO withdrawals (id, school_id, school_name, amount, status) VALUES (?, ?, ?, ?, 'pending')").run(id, school_id, school.school_name, amount);
    db.prepare("UPDATE schools SET total_earnings = total_earnings - ? WHERE school_id = ?").run(amount, school_id);
    res.json({ message: "Withdrawal request submitted successfully. You will be contacted within 24 hours." });
  } catch (err) {
    console.error("❌ request-withdrawal error:", err);
    res.status(500).json({ error: "Withdrawal request failed" });
  }
});

// Strip markdown and trim text for faster TTS processing
function cleanForTTS(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, '')          // code blocks
    .replace(/`([^`]+)`/g, '$1')             // inline code
    .replace(/#{1,6}\s+/g, '')               // headings
    .replace(/\*\*([^*]+)\*\*/g, '$1')       // bold
    .replace(/\*([^*]+)\*/g, '$1')           // italic
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/^\s*[-*+]\s/gm, '')            // bullets
    .replace(/^\s*\d+\.\s/gm, '')            // numbered lists
    .replace(/\n{3,}/g, '\n')               // excess newlines
    .trim()
    .substring(0, 1200);                     // cap length
}

app.post("/get-audio", async (req, res) => {
  const { text, user_id } = req.body;
  try {
    // Deduct 1 unit for audio/voice explanation
    if (user_id && db) {
      db.prepare("INSERT OR IGNORE INTO users (uid, credits) VALUES (?, 10)").run(user_id);
      const credits = getUserCredits(user_id);
      if (credits < 1) return res.status(403).json({ error: "No units for audio" });
      db.prepare("UPDATE users SET credits = MAX(0, credits - 1) WHERE uid = ?").run(user_id);
      console.log(`💳 Deducted 1 unit (audio) from ${user_id}`);
    }
    const cleanText = cleanForTTS(text);
    console.log(`🔊 TTS: ${cleanText.length} chars (was ${text?.length || 0})`);
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ role: "user", parts: [{ text: `Say this in a warm, natural Nigerian English accent — confident and friendly, like a knowledgeable Nigerian teacher explaining to a student:\n\n${cleanText}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } }
      },
    });
    const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audioData) {
      console.error("❌ No audio data returned from TTS model");
      return res.status(500).json({ error: "No audio generated" });
    }
    res.json({ audio: audioData });
  } catch (err: any) {
    console.error("❌ get-audio error:", err?.message || err);
    res.status(500).json({ error: "Audio failed" });
  }
});

app.post("/api/transcribe", async (req, res) => {
  const { audioBase64 } = req.body;
  if (!audioBase64) return res.status(400).json({ error: "No audio provided" });
  try {
    // audioBase64 is a data URL like "data:audio/webm;base64,XXXX"
    const base64Data = audioBase64.includes(',') ? audioBase64.split(',')[1] : audioBase64;
    const mimeType = audioBase64.includes('data:') ? audioBase64.split(';')[0].split(':')[1] : 'audio/webm';
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{
        role: "user",
        parts: [
          { inlineData: { mimeType, data: base64Data } },
          { text: "Transcribe the spoken words in this audio. Return only the transcribed text, nothing else." }
        ]
      }],
    });
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || "";
    console.log(`✅ Transcribed: "${text.substring(0, 60)}"`);
    res.json({ text });
  } catch (err: any) {
    console.error("❌ transcribe error:", err?.message || err);
    res.status(500).json({ error: "Transcription failed" });
  }
});

app.get("/api/schools/by-slug/:slug", (req, res) => {
  const { slug } = req.params;
  if (!db) return res.status(500).json({ error: "DB missing" });
  try {
    const school = db.prepare("SELECT school_id, school_name, school_slug, referral_code, total_students, total_earnings FROM schools WHERE school_slug = ?").get(slug) as any;
    if (!school) return res.status(404).json({ error: "School not found" });
    res.json(school);
  } catch (err) { res.status(500).json({ error: "Failed to fetch school" }); }
});

app.post("/api/whatsapp/message", (req, res) => {
  const { user_id, user_message } = req.body;
  if (!db) return res.status(500).json({ error: "DB missing" });
  try {
    const message = user_message.trim().toUpperCase();
    if (message.startsWith("JOIN")) {
      const code = message.split(" ")[1];
      const school = db.prepare("SELECT * FROM schools WHERE referral_code = ?").get(code) as any;
      if (school) {
        db.prepare("UPDATE users SET schoolId = ? WHERE uid = ?").run(school.school_id, user_id);
        return res.json({ message: `Welcome to ExamPLE! Powered by ${school.school_name}.` });
      }
    }
    res.json({ message: "Command not recognized." });
  } catch (err) { res.status(500).json({ error: "WhatsApp failed" }); }
});

// --- 7. ADMIN ROUTES (HMAC-signed tokens, survive restarts) ---

const signAdminToken = (secret: string): string => {
  const ts = Date.now().toString();
  const sig = createHmac('sha256', secret).update(ts).digest('hex');
  return `${ts}.${sig}`;
};

const verifyAdminToken = (token: string): boolean => {
  const secret = (process.env.ADMIN_SECRET || '').trim();
  if (!secret || !token) return false;
  const [ts, sig] = token.split('.');
  if (!ts || !sig) return false;
  if (Date.now() - Number(ts) > 24 * 60 * 60 * 1000) return false; // 24h expiry
  const expected = createHmac('sha256', secret).update(ts).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch { return false; }
};

const requireAdmin = (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!verifyAdminToken(token)) return res.status(401).json({ error: "Unauthorized" });
  next();
};

app.post("/admin/login", (req, res) => {
  const { password } = req.body;
  const secret = (process.env.ADMIN_SECRET || '').trim();
  if (!secret) return res.status(500).json({ error: "Admin not configured" });
  const attempt = (password || '').trim();
  console.log(`🛡️ Admin login attempt (secret length: ${secret.length}, attempt length: ${attempt.length})`);
  if (attempt !== secret) return res.status(401).json({ error: "Invalid password" });
  const token = signAdminToken(secret);
  console.log("🛡️ Admin login successful");
  res.json({ token });
});

app.get("/admin/stats", requireAdmin, (req, res) => {
  if (!db) return res.status(500).json({ error: "DB missing" });
  try {
    const totalUsers = (db.prepare("SELECT COUNT(*) as c FROM users").get() as any)?.c || 0;
    const totalSchools = (db.prepare("SELECT COUNT(*) as c FROM schools").get() as any)?.c || 0;
    const totalRevenue = (db.prepare("SELECT SUM(total_earnings) as s FROM schools").get() as any)?.s || 0;
    const totalWithdrawals = (db.prepare("SELECT COALESCE(SUM(amount),0) as s FROM withdrawals WHERE status = 'paid'").get() as any)?.s || 0;
    res.json({ totalUsers, totalSchools, totalRevenue, totalWithdrawals });
  } catch (err) { res.status(500).json({ error: "Stats failed" }); }
});

app.get("/admin/schools", requireAdmin, (req, res) => {
  if (!db) return res.status(500).json({ error: "DB missing" });
  try {
    const schools = db.prepare("SELECT school_id, school_name, school_slug, referral_code, total_students, total_earnings FROM schools ORDER BY rowid DESC").all();
    res.json(schools);
  } catch (err) { res.status(500).json({ error: "Schools failed" }); }
});

app.get("/admin/withdrawals", requireAdmin, (req, res) => {
  if (!db) return res.status(500).json({ error: "DB missing" });
  try {
    const withdrawals = db.prepare("SELECT * FROM withdrawals ORDER BY timestamp DESC LIMIT 50").all();
    res.json(withdrawals);
  } catch (err) { res.status(500).json({ error: "Withdrawals failed" }); }
});

app.get("/admin/activity", requireAdmin, (req, res) => {
  if (!db) return res.status(500).json({ error: "DB missing" });
  try {
    // Combine recent school registrations + withdrawals as an activity feed
    const recentSchools = db.prepare(
      "SELECT school_name, 'school_registration' as type, 0 as amount, school_id as id FROM schools ORDER BY rowid DESC LIMIT 10"
    ).all() as any[];
    const recentWithdrawals = db.prepare(
      "SELECT school_name, 'withdrawal' as type, amount, id, timestamp FROM withdrawals ORDER BY timestamp DESC LIMIT 10"
    ).all() as any[];
    const activity = [...recentSchools.map((s: any) => ({ ...s, timestamp: new Date().toISOString() })), ...recentWithdrawals]
      .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 15);
    res.json(activity);
  } catch (err) { res.status(500).json({ error: "Activity failed" }); }
});

app.post("/admin/withdrawals/mark-paid", requireAdmin, (req, res) => {
  const { withdrawal_id } = req.body;
  if (!withdrawal_id || !db) return res.status(400).json({ error: "Missing data" });
  try {
    db.prepare("UPDATE withdrawals SET status = 'paid' WHERE id = ?").run(withdrawal_id);
    console.log(`✅ Withdrawal ${withdrawal_id} marked as paid`);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Failed to update" }); }
});

// --- 8. API STATUS ---
app.get("/", (req, res) => {
  res.json({
    message: "ExamPLE API is online",
    status: "ready",
    endpoints: ["/ask-question", "/get-audio", "/register-school", "/api/auth/simple", "/api/payments/initialize"]
  });
});

// --- 8. GLOBAL ERROR HANDLING ---
process.on("uncaughtException", (err) => { console.error("Uncaught Exception:", err); });
process.on("unhandledRejection", (err) => { console.error("Unhandled Rejection:", err); });

// --- 9. SERVER START ---
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 ExamPLE API running on port ${PORT}`);
});
