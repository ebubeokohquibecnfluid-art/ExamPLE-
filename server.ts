import express from "express";
import path from "path";
import fs from "fs";
import axios from "axios";
import cors from "cors";
import multer from "multer";
import { GoogleGenAI, Modality } from "@google/genai";
import { getDb } from "./src/db.js";
import { TTS_MODELS, TTS_RETRY_BASE_DELAY_MS } from "./src/services/geminiService.js";

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const ADMIN_SECRET = "exam-admin-2026";

// Images are stored as base64 data URLs in PostgreSQL — no disk files,
// so they survive republishes and never depend on the server's hostname.
const memoryStorage = multer.memoryStorage();
const uploadLogo = multer({
  storage: memoryStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});
const uploadHeader = multer({
  storage: memoryStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});

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
// DB init must complete before the server accepts any connections.
// Do NOT start listening until getDb() resolves so that the !db guard
// in every endpoint is never triggered by a cold-start race condition.
const dbReady = getDb()
  .then(database => {
    db = database;
    console.log("✅ Database connected");
    
    // Ensure schema is up to date (IF NOT EXISTS prevents errors on re-runs)
    db.run("ALTER TABLE users ADD COLUMN IF NOT EXISTS expiry_date TEXT").catch(() => {});
    db.run("ALTER TABLE users ADD COLUMN IF NOT EXISTS displayname TEXT").catch(() => {});
    db.run("ALTER TABLE schools ADD COLUMN IF NOT EXISTS total_earnings REAL DEFAULT 0").catch(() => {});
    db.run(`CREATE TABLE IF NOT EXISTS migration_requests (
      id TEXT PRIMARY KEY,
      uid TEXT NOT NULL,
      school_id TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`).catch(() => {});
  })
  .catch(err => {
    console.error("❌ DB Connection Error:", err);
    process.exit(1); // Fail fast — autoscale will restart cleanly
  });

// --- 5. ENVIRONMENT VARIABLES ---
const apiKey = (process.env.REAL_GEMINI_KEY || process.env.GEMINI_API_KEY || "").trim();
if (!apiKey) console.error("❌ Missing Gemini API Key");

const ai = new GoogleGenAI({ apiKey });

const PRIMARY_MODEL = "gemini-2.5-flash";
const FALLBACK_MODEL = "gemini-2.5-flash-lite";

// Retry generateContent: tries PRIMARY_MODEL, falls back to FALLBACK_MODEL on 503/overload
async function generateWithRetry(params: { config?: any; contents: any[] }): Promise<any> {
  const models = [PRIMARY_MODEL, FALLBACK_MODEL];
  let lastErr: any;
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await ai.models.generateContent({ model, ...params });
      } catch (e: any) {
        const is503 = e?.message?.includes('503') || e?.message?.includes('UNAVAILABLE') || e?.status === 503;
        lastErr = e;
        if (is503 && attempt === 0) {
          await new Promise(r => setTimeout(r, 1500)); // wait 1.5s then retry same model
          continue;
        }
        break; // non-503 or second attempt failed — try next model
      }
    }
  }
  throw lastErr;
}

// Same for streaming
async function generateStreamWithRetry(params: { config?: any; contents: any[] }): Promise<any> {
  const models = [PRIMARY_MODEL, FALLBACK_MODEL];
  let lastErr: any;
  for (const model of models) {
    try {
      return await ai.models.generateContentStream({ model, ...params });
    } catch (e: any) {
      lastErr = e;
    }
  }
  throw lastErr;
}
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
const PLAN_PRICES = { 'Basic': 2500, 'Premium': 4500, 'Max': 6500, 'Top-up': 500 };
const PLAN_UNITS = { 'Basic': 50, 'Premium': 100, 'Max': 250, 'Top-up': 10 };

// Helper for credits
const getUserCredits = async (userId) => {
  if (!db) return 0;
  const user = await db.get("SELECT credits, expiry_date, trial_expires_at FROM users WHERE uid = ?", [userId]);
  if (!user) return 0;

  const now = new Date();

  // Check paid subscription / admin topup expiry
  if (user.expiry_date) {
    const subExpiry = new Date(user.expiry_date);
    if (subExpiry < now) {
      // Subscription expired — clear it so the trial check below applies
      await db.run("UPDATE users SET credits = 0, expiry_date = NULL WHERE uid = ?", [userId]);
      return 0;
    }
    // Active subscription or admin-topped-up account — return credits normally
    return user.credits;
  }

  // No active subscription — check 7-day free trial window
  if (user.trial_expires_at) {
    const trialExpiry = new Date(user.trial_expires_at);
    if (trialExpiry < now) {
      // Trial window has closed — block access but do NOT zero credits in DB
      // (admin may have added credits without this code running first)
      return 0;
    }
  }

  return user.credits;
};

// --- 6. API ENDPOINTS ---
app.post("/api/auth/simple", async (req, res) => {
  const { uid, returnOnly, displayName } = req.body;
  if (!uid || !db) return res.status(400).json({ error: "Missing data" });
  try {
    const user = await db.get("SELECT * FROM users WHERE uid = ?", [uid]);
    let newlyCreated = false;
    if (!user) {
      if (returnOnly) return res.status(404).json({ error: "User not found" });

      // IP abuse check — only for new independent students (no school link yet)
      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
      const adminBypass = req.headers['x-admin-bypass'];
      const isAdminBypass = adminBypass && adminBypass === ADMIN_SECRET;
      if (!isAdminBypass) {
        const existingFromIp = await db.get("SELECT uid FROM users WHERE created_ip = ? AND schoolid IS NULL", [clientIp]);
        if (existingFromIp && clientIp !== 'unknown') {
          return res.status(429).json({ error: "IP_LIMIT", message: "An account already exists from this network. Please use your existing Student Code to log in." });
        }
      }

      const trialExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      // ON CONFLICT DO UPDATE makes this idempotent — concurrent or repeated sign-in
      // attempts for the same uid will never produce a duplicate-key error.
      // Existing credits/ip/expiry are preserved; only a missing displayname is filled in.
      await db.run(
        `INSERT INTO users (uid, credits, displayname, created_ip, trial_expires_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (uid) DO UPDATE SET
           displayname = COALESCE(users.displayname, EXCLUDED.displayname)`,
        [uid, 10, displayName || "Student", clientIp, trialExpiresAt]
      );
      newlyCreated = true;
    } else if (displayName && !user.displayname) {
      await db.run("UPDATE users SET displayname = ? WHERE uid = ?", [displayName, uid]);
    }
    const fresh = await db.get("SELECT * FROM users WHERE uid = ?", [uid]);
    // Attach school customisation so the frontend can theme itself
    let schoolMeta = null;
    if (fresh && fresh.schoolId) {
      schoolMeta = await db.get(
        "SELECT school_name, school_slug, primary_color, logo_url, tagline, header_image_url FROM schools WHERE school_id = ?",
        [fresh.schoolId]
      );
    }
    res.json({ ...fresh, school: schoolMeta, newlyCreated });
  } catch (err) { res.status(500).json({ error: "Auth failed" }); }
});

// Update a student's display name
app.post("/api/user/update-name", async (req, res) => {
  const { uid, displayName } = req.body;
  if (!db || !uid || !displayName?.trim()) return res.status(400).json({ error: "Missing data" });
  try {
    await db.run("UPDATE users SET displayname = ? WHERE uid = ?", [displayName.trim(), uid]);
    res.json({ success: true, displayName: displayName.trim() });
  } catch (err) { res.status(500).json({ error: "Could not update name" }); }
});

// Save / update a student's email address (for payment receipts)
app.post("/api/user/save-email", async (req, res) => {
  const { uid, email } = req.body;
  if (!db || !uid || !email) return res.status(400).json({ error: "Missing uid or email" });
  const clean = String(email).toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return res.status(400).json({ error: "Invalid email" });
  try {
    await db.run("UPDATE users SET email = ? WHERE uid = ?", [clean, uid]);
    res.json({ success: true, email: clean });
  } catch (err) { res.status(500).json({ error: "Could not save email" }); }
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
      student = await db.get("SELECT uid, displayname FROM users WHERE displayname = ? AND schoolid = ?", [displayName, school.school_id]);
      if (!student) return res.status(404).json({ error: "No student found with that name in this school." });
    } else {
      // Independent student: find by name with no school linked
      student = await db.get("SELECT uid, displayname FROM users WHERE displayname = ? AND schoolid IS NULL", [displayName]);
      if (!student) return res.status(404).json({ error: "No independent student found with that name." });
    }
    const code = student.uid.replace('user_', '');
    res.json({ success: true, code, displayName: student.displayName });
  } catch (err) { res.status(500).json({ error: "Recovery failed" }); }
});

app.post("/api/payments/initialize", async (req, res) => {
  const { email, amount, userId, planName, callbackBase } = req.body;
  if (!userId || !amount || !planName) return res.status(400).json({ error: "Missing required payment fields" });
  const credits = PLAN_UNITS[planName] || 0;
  // Use the domain the user is actually on — fallback to APP_URL env, then hardcoded custom domain
  const appBase = (callbackBase || process.env.APP_URL || 'https://exam-ple.xyz').replace(/\/$/, '');

  // Demo Mode check
  if (PAYSTACK_SECRET === "sk_test_examPLE_demo_key_999") {
    return res.json({ status: true, data: { authorization_url: `${appBase}/payment-success?demo=true&userId=${userId}&credits=${credits}&amount=${amount}` } });
  }
  if (!PAYSTACK_SECRET) return res.status(500).json({ error: "Paystack not configured" });
  if (!email) return res.status(400).json({ error: "Email is required to process payment" });
  try {
    const response = await axios.post("https://api.paystack.co/transaction/initialize", {
      email, 
      amount: amount * 100, 
      metadata: { userId, planName, credits },
      callback_url: `${appBase}/payment-success`
    }, { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } });
    res.json(response.data);
  } catch (err) { res.status(500).json({ error: "Payment failed" }); }
});

// Shared helper: record a verified payment, allocate credits, split revenue
async function processPayment(opts: {
  reference: string;
  userId: string;
  userEmail: string;
  planName: string;
  creditAmount: number;
  totalAmount: number; // naira
}) {
  if (!db) throw new Error("DB missing");
  const { reference, userId, userEmail, planName, creditAmount, totalAmount } = opts;

  // Fetch user and school details outside the transaction (read-only, no race risk)
  const user = await db.get(
    "SELECT displayname, schoolId FROM users WHERE uid = ?",
    [userId]
  );
  const userName = user?.displayName || user?.displayname || userEmail;
  const schoolId = user?.schoolId || null;

  let schoolName: string | null = null;
  let schoolShare = 0;
  let platformShare = totalAmount;

  if (schoolId) {
    const school = await db.get(
      "SELECT school_name FROM schools WHERE school_id = ?",
      [schoolId]
    );
    schoolName = school?.school_name || null;
    schoolShare = Math.round(totalAmount * 0.40 * 100) / 100;
    platformShare = Math.round((totalAmount - schoolShare) * 100) / 100;
  }

  const now = new Date().toISOString();
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + 30);

  // Wrap all writes in a single atomic transaction.
  // The payment INSERT uses ON CONFLICT DO NOTHING as the idempotency lock —
  // if rowCount is 0, this reference was already processed and we bail out.
  await db.transaction(async (tx) => {
    const insert = await tx.run(
      `INSERT INTO payments (reference, user_id, user_name, user_email, plan_name, total_amount, platform_share, school_share, school_id, school_name, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (reference) DO NOTHING`,
      [reference, userId, userName, userEmail, planName, totalAmount, platformShare, schoolShare, schoolId, schoolName, now]
    );

    // If nothing was inserted, this reference was already processed — skip
    if (insert.changes === 0) return;

    // 1. Add credits and set 30-day expiry
    await tx.run(
      "UPDATE users SET credits = credits + ?, expiry_date = ? WHERE uid = ?",
      [creditAmount, expiry.toISOString(), userId]
    );

    // 2. Credit school's earnings
    if (schoolId && schoolShare > 0) {
      await tx.run(
        "UPDATE schools SET total_earnings = total_earnings + ? WHERE school_id = ?",
        [schoolShare, schoolId]
      );
    }

    // 3. Activity log
    await tx.run(
      "INSERT INTO activity (type, details, timestamp) VALUES (?, ?, ?)",
      ['payment', JSON.stringify({ reference, userId, userName, userEmail, planName, totalAmount, platformShare, schoolShare, schoolId, schoolName }), now]
    );
  });

  console.log(`✅ Payment recorded: ${reference} | ${userName} | ₦${totalAmount} | school: ${schoolName || 'independent'} | platform: ₦${platformShare} | school: ₦${schoolShare}`);
}

app.get("/payment-success", async (req, res) => {
  const { demo, userId, credits, amount, reference } = req.query;
  const distPath = path.join(process.cwd(), "dist");

  // --- DEMO MODE ---
  if (demo === "true" && userId && credits && amount && db) {
    try {
      await processPayment({
        reference: `demo_${userId}_${Date.now()}`,
        userId: String(userId),
        userEmail: 'demo@example.com',
        planName: 'Demo',
        creditAmount: Number(credits),
        totalAmount: Number(amount),
      });
    } catch (err) {
      console.error("Demo payment error:", err);
    }
    return res.sendFile(path.join(distPath, "index.html"));
  }

  // --- LIVE PAYSTACK MODE ---
  if (reference && PAYSTACK_SECRET && db) {
    try {
      const verify = await axios.get(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(String(reference))}`,
        { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
      );
      const txn = verify.data?.data;
      if (txn && txn.status === 'success') {
        const meta = txn.metadata || {};
        const uid = meta.userId || meta.user_id;
        const planName = meta.planName || meta.plan_name || 'Unknown';
        const creditAmt = Number(meta.credits) || PLAN_UNITS[planName] || 0;
        const totalAmt = txn.amount / 100; // kobo → naira
        const email = txn.customer?.email || '';
        if (uid) {
          await processPayment({
            reference: String(reference),
            userId: uid,
            userEmail: email,
            planName,
            creditAmount: creditAmt,
            totalAmount: totalAmt,
          });
        }
      }
    } catch (err: any) {
      console.error("Paystack verify error:", err?.message || err);
    }
  }

  return res.sendFile(path.join(distPath, "index.html"));
});

// Frontend-callable payment verification — used by the SPA after Paystack redirect
// (Vercel's catch-all intercepts GET /payment-success before it reaches the backend,
//  so the SPA calls this API endpoint instead to actually verify and credit the user)
app.post("/api/payments/verify", async (req, res) => {
  const { reference, userId } = req.body;
  if (!reference || !userId) return res.status(400).json({ error: "Missing reference or userId" });
  if (!db) return res.status(500).json({ error: "DB unavailable" });

  // Idempotency: if already processed, just return success without charging again
  const existing = await db.get("SELECT plan_name FROM payments WHERE reference = ?", [reference]);
  if (existing) {
    return res.json({ success: true, alreadyProcessed: true, planName: existing.plan_name });
  }

  if (!PAYSTACK_SECRET) return res.status(500).json({ error: "Paystack not configured" });

  // Test-mode gate: test keys are accepted but credits are NOT allocated.
  // This lets you verify the full payment UI flow without adding fake credits.
  // Set PAYMENT_LIVE_MODE=true in your secrets when you switch to live keys.
  const isLiveMode = process.env.PAYMENT_LIVE_MODE === 'true';
  const isTestKey = PAYSTACK_SECRET.startsWith('sk_test_');
  if (isTestKey && !isLiveMode) {
    console.log(`[test-mode] Payment reference ${reference} received — credits NOT allocated (test key, live mode off)`);
    return res.json({ success: true, testMode: true, planName: 'Test', credits: 0 });
  }

  try {
    const verify = await axios.get(
      `https://api.paystack.co/transaction/verify/${String(reference)}`,
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
    );
    const txn = verify.data?.data;
    if (!txn || txn.status !== 'success') {
      console.error("Paystack txn not success:", txn?.status, txn?.gateway_response);
      return res.status(402).json({ error: "Payment not confirmed by Paystack" });
    }

    const meta = txn.metadata || {};
    const uid = meta.userId || meta.user_id || userId;
    const planName = meta.planName || meta.plan_name || 'Unknown';
    const creditAmt = Number(meta.credits) || PLAN_UNITS[planName] || 0;
    const totalAmt = txn.amount / 100;
    const email = txn.customer?.email || '';

    await processPayment({ reference: String(reference), userId: uid, userEmail: email, planName, creditAmount: creditAmt, totalAmount: totalAmt });
    return res.json({ success: true, planName, credits: creditAmt, amount: totalAmt });
  } catch (err: any) {
    const paystackMsg = err?.response?.data?.message || err?.message || err;
    console.error("Payment verify error:", paystackMsg);
    return res.status(500).json({ error: "Verification failed", detail: paystackMsg });
  }
});

// Payment history for a school dashboard (school students only)
app.get("/api/payments/school/:school_slug", async (req, res) => {
  const { school_slug } = req.params;
  const pwd = req.headers['x-school-password'] as string;
  if (!db || !school_slug || !pwd) return res.status(400).json({ error: "Missing data" });
  try {
    const school = await db.get("SELECT school_id, school_name, password FROM schools WHERE school_slug = ?", [school_slug]);
    if (!school) return res.status(404).json({ error: "School not found" });
    if (school.password !== pwd) return res.status(401).json({ error: "Invalid password" });
    const rows = await db.all(
      "SELECT reference, user_name, user_email, plan_name, total_amount, platform_share, school_share, timestamp FROM payments WHERE school_id = ? ORDER BY timestamp DESC LIMIT 100",
      [school.schoolId || school.school_id]
    );
    res.json({ school_name: school.school_name, payments: rows });
  } catch (err) { res.status(500).json({ error: "Query failed" }); }
});

// Admin: full payment ledger
app.get("/api/admin/payments", async (req, res) => {
  const secret = req.headers['x-admin-secret'] as string;
  if (secret !== ADMIN_SECRET) return res.status(401).json({ error: "Unauthorized" });
  if (!db) return res.status(500).json({ error: "DB missing" });
  try {
    const rows = await db.all(
      "SELECT reference, user_name, user_email, plan_name, total_amount, platform_share, school_share, school_name, timestamp FROM payments ORDER BY timestamp DESC LIMIT 500",
      []
    );
    const totals = await db.get(
      "SELECT COALESCE(SUM(total_amount),0) AS total_revenue, COALESCE(SUM(platform_share),0) AS platform_total, COALESCE(SUM(school_share),0) AS school_total FROM payments",
      []
    );
    res.json({ payments: rows, totals });
  } catch (err) { res.status(500).json({ error: "Query failed" }); }
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
6. ${tone}
7. COMPLETENESS IS MANDATORY: If a topic has a fixed number of parts (e.g. 3 Newton's Laws, 4 blood groups, 5 senses), you MUST cover every single one in the same response — never stop partway through a list. Always finish what you start.`;


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

    const stream = await generateStreamWithRetry({
      config: {
        systemInstruction,
        maxOutputTokens: 8192,
        thinkingConfig: { thinkingBudget: 2048 },
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

    // Only deduct credits if the AI actually returned content; no charge for empty/failed responses
    if (db && totalText) {
      await db.run("UPDATE users SET credits = GREATEST(0, credits - ?) WHERE uid = ?", [cost, user_id]);
    }
    res.write(`data: [DONE]\n\n`);
    res.end();
  } catch (e: any) {
    console.error("ask-question error:", e?.message || e);
    // No credit deduction on error — user is not charged if the AI call fails
    try { res.write(`data: ${JSON.stringify({ error: "AI unavailable", debug: e?.message })}\n\n`); res.end(); } catch {}
  }
});

app.post("/register-school", async (req, res) => {
  const { school_name, password } = req.body;
  if (!school_name || !password || !db) return res.status(400).json({ error: "Missing data" });
  try {
    const baseSlug = school_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    let school_slug = baseSlug;
    let counter = 2;
    while (await db.get("SELECT 1 FROM schools WHERE school_slug = ?", [school_slug])) {
      school_slug = `${baseSlug}-${counter++}`;
    }
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

app.post("/api/transcribe", async (req, res) => {
  const { audioBase64 } = req.body;
  if (!audioBase64) return res.status(400).json({ error: "Missing audio" });
  try {
    const mimeMatch = audioBase64.match(/^data:([^;]+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'audio/webm';
    const base64Data = audioBase64.replace(/^data:[^;]+;base64,/, '');
    const response = await generateWithRetry({
      contents: [{
        parts: [
          { inlineData: { mimeType, data: base64Data } },
          { text: "Transcribe exactly what is being said in this audio. Return only the spoken words, nothing else. No punctuation adjustments, no commentary." }
        ]
      }]
    });
    res.json({ text: response.text?.trim() || "" });
  } catch (err: any) {
    console.error("Transcription error:", err?.message || err);
    res.status(500).json({ error: "Transcription failed", debug: err?.message });
  }
});

app.post("/get-audio", async (req, res) => {
  const { text, user_id } = req.body;
  try {
    // Check credits before attempting generation, but do NOT deduct yet
    if (user_id && db) {
      const credits = await getUserCredits(user_id);
      if (credits < 2) return res.status(403).json({ error: "Not enough credits for audio" });
    }

    // Strip markdown, then truncate at a sentence boundary to keep TTS fast
    const stripped = String(text || '')
      .replace(/#{1,6}\s*/g, '')
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/`{1,3}/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\n{2,}/g, '. ')
      .replace(/\n/g, ' ')
      .trim();
    const MAX_TTS_CHARS = 1000;
    let cleanText = stripped;
    if (stripped.length > MAX_TTS_CHARS) {
      const cutoff = stripped.slice(0, MAX_TTS_CHARS);
      const lastSentence = cutoff.search(/[.!?][^.!?]*$/);
      cleanText = lastSentence > 0 ? cutoff.slice(0, lastSentence + 1) : cutoff;
    }

    // Try each TTS model in order; fall back to the next if one fails
    let audioData: string | undefined;
    let lastError: unknown;
    let modelIndexUsed = -1;
    for (let i = 0; i < TTS_MODELS.length; i++) {
      if (i > 0) {
        const delayMs = TTS_RETRY_BASE_DELAY_MS * Math.pow(2, i - 1);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
      const model = TTS_MODELS[i];
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [{ 
            parts: [{ 
              text: `Say this exactly, but use a friendly, professional Nigerian teacher accent and rhythm: ${cleanText}` 
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
        const data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (data) { audioData = data; modelIndexUsed = i; break; }
        lastError = new Error("No audio data in response");
      } catch (err) {
        console.error(`Audio generation failed with model ${model}:`, err);
        lastError = err;
      }
    }

    if (!audioData) {
      console.error("All TTS models exhausted:", lastError);
      return res.status(503).json({ 
        error: "Voice generation is temporarily unavailable. Please try again later." 
      });
    }

    // Only deduct credits after audio was successfully generated
    if (user_id && db) {
      await db.run("UPDATE users SET credits = GREATEST(0, credits - 2) WHERE uid = ?", [user_id]);
    }

    res.json({ 
      audio: audioData,
      mimeType: 'audio/pcm',
      voice: 'gemini-tts',
      fallbackUsed: modelIndexUsed > 0
    });
  } catch (err) { 
    console.error("Audio generation failed:", err);
    res.status(500).json({ error: "Voice generation is temporarily unavailable. Please try again later." }); 
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

    const response = await generateWithRetry({
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
    // Deduct credits only after questions are successfully generated and stored
    await db.run("UPDATE users SET credits = GREATEST(0, credits - ?) WHERE uid = ?", [cost, user_id]);

    // Return questions WITHOUT answers/scheme/mistakes (those stay server-side)
    res.json({
      session_id,
      subject, level, exam_type, time_minutes,
      questions: questions.map(({ q, opts }: any) => ({ q, opts })),
      total: questions.length,
    });
  } catch (e: any) {
    console.error("exam/start error:", JSON.stringify(e?.message || e));
    const is503 = e?.message?.includes('503') || e?.message?.includes('UNAVAILABLE');
    res.status(500).json({
      error: is503
        ? "AI is experiencing high demand right now. Please wait a moment and try again."
        : "Failed to generate exam. Please try again."
    });
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
  if (!db) return res.status(503).json({ error: "Database unavailable" });
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
    res.status(500).json({ error: "Failed to load progress" });
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
    const school = await db.get(
      "SELECT school_id, school_name, school_slug, referral_code, primary_color, logo_url, tagline, header_image_url FROM schools WHERE school_slug = ?",
      [slug]
    );
    if (school) res.json(school);
    else res.status(404).json({ error: "School not found" });
  } catch (err) { res.status(500).json({ error: "Query failed" }); }
});

// Direct student→school link (replaces WhatsApp JOIN hack)
app.post("/api/schools/link-student", async (req, res) => {
  const { uid, school_id } = req.body;
  if (!db || !uid || !school_id) return res.status(400).json({ error: "Missing data" });
  try {
    const school = await db.get("SELECT school_id, school_name FROM schools WHERE school_id = ?", [school_id]);
    if (!school) return res.status(404).json({ error: "School not found" });
    await db.run("UPDATE users SET schoolId = ? WHERE uid = ?", [school_id, uid]);
    await db.run("UPDATE schools SET total_students = (SELECT COUNT(*) FROM users WHERE schoolId = ?) WHERE school_id = ?", [school_id, school_id]);
    res.json({ success: true, school_name: school.school_name });
  } catch (err) { res.status(500).json({ error: "Link failed" }); }
});

// Submit a migration request (existing independent student wants to join a school)
app.post("/api/schools/migration-request", async (req, res) => {
  const { uid, school_id } = req.body;
  if (!db || !uid || !school_id) return res.status(400).json({ error: "Missing data" });
  try {
    const user = await db.get("SELECT uid, displayname, schoolId FROM users WHERE uid = ?", [uid]);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.schoolId) return res.status(400).json({ error: "Already linked to a school" });
    const school = await db.get("SELECT school_id, school_name FROM schools WHERE school_id = ?", [school_id]);
    if (!school) return res.status(404).json({ error: "School not found" });
    // Cancel any previous pending request for this student+school pair
    await db.run("DELETE FROM migration_requests WHERE uid = ? AND school_id = ? AND status = 'pending'", [uid, school_id]);
    const id = `mig_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.run(
      "INSERT INTO migration_requests (id, uid, school_id, status, created_at) VALUES (?, ?, ?, 'pending', CURRENT_TIMESTAMP)",
      [id, uid, school_id]
    );
    res.json({ success: true, requestId: id, schoolName: school.school_name });
  } catch (err: any) {
    console.error("migration-request error:", err?.message);
    res.status(500).json({ error: "Request failed" });
  }
});

// List pending migration requests for a school dashboard
app.post("/api/schools/:school_id/migration-requests", async (req, res) => {
  const { school_id } = req.params;
  const { password } = req.body;
  if (!db || !password) return res.status(400).json({ error: "Missing data" });
  try {
    const school = await db.get("SELECT school_id, password FROM schools WHERE school_id = ?", [school_id]);
    if (!school || school.password !== password) return res.status(403).json({ error: "Invalid credentials" });
    const requests = await db.all(
      `SELECT mr.id, mr.uid, mr.status, mr.created_at, u.displayname as displayName
       FROM migration_requests mr
       JOIN users u ON u.uid = mr.uid
       WHERE mr.school_id = ? AND mr.status = 'pending'
       ORDER BY mr.created_at DESC`,
      [school_id]
    );
    res.json({ requests });
  } catch (err: any) {
    console.error("migration-requests list error:", err?.message);
    res.status(500).json({ error: "Query failed" });
  }
});

// Approve or reject a migration request
app.post("/api/schools/migration-requests/:id/decide", async (req, res) => {
  const { id } = req.params;
  const { action, password } = req.body; // action: 'approve' | 'reject'
  if (!db || !action || !password) return res.status(400).json({ error: "Missing data" });
  try {
    const mr = await db.get("SELECT * FROM migration_requests WHERE id = ?", [id]);
    if (!mr) return res.status(404).json({ error: "Request not found" });
    const school = await db.get("SELECT school_id, school_name, password FROM schools WHERE school_id = ?", [mr.school_id]);
    if (!school || school.password !== password) return res.status(403).json({ error: "Invalid credentials" });
    if (mr.status !== 'pending') return res.status(400).json({ error: "Request already resolved" });
    if (action === 'approve') {
      await db.run("UPDATE users SET schoolId = ? WHERE uid = ?", [mr.school_id, mr.uid]);
      await db.run("UPDATE schools SET total_students = (SELECT COUNT(*) FROM users WHERE schoolId = ?) WHERE school_id = ?", [mr.school_id, mr.school_id]);
    }
    await db.run("UPDATE migration_requests SET status = ? WHERE id = ?", [action === 'approve' ? 'approved' : 'rejected', id]);
    res.json({ success: true, action, schoolName: school.school_name });
  } catch (err: any) {
    console.error("migration-decide error:", err?.message);
    res.status(500).json({ error: "Decision failed" });
  }
});

// Save school customisation (color, logo, tagline, header_image)
app.post("/api/schools/save-customization", async (req, res) => {
  const { school_slug, password, primary_color, logo_url, tagline, header_image_url } = req.body;
  if (!db || !school_slug || !password) return res.status(400).json({ error: "Missing data" });
  try {
    const school = await db.get("SELECT * FROM schools WHERE school_slug = ?", [school_slug]);
    if (!school) return res.status(404).json({ error: "School not found" });
    if (school.password !== password) return res.status(401).json({ error: "Invalid password" });
    await db.run(
      "UPDATE schools SET primary_color = ?, logo_url = ?, tagline = ?, header_image_url = ? WHERE school_slug = ?",
      [primary_color || '#008751', logo_url || null, tagline || null, header_image_url || null, school_slug]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Customisation save failed" }); }
});

// Upload school logo — stored as base64 data URL in PostgreSQL (survives republishes)
app.post("/api/schools/upload-logo", uploadLogo.single('logo'), async (req: any, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const dataUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
  res.json({ success: true, logo_url: dataUrl });
});

// Upload school header image — stored as base64 data URL in PostgreSQL (survives republishes)
app.post("/api/schools/upload-header", uploadHeader.single('header'), async (req: any, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const dataUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
  res.json({ success: true, header_image_url: dataUrl });
});

// Account deletion
app.post("/api/account/delete", async (req, res) => {
  const { uid, type } = req.body; // type: 'temporary' | 'permanent'
  if (!db || !uid || !type) return res.status(400).json({ error: "Missing data" });
  try {
    const user = await db.get("SELECT uid, displayname FROM users WHERE uid = ?", [uid]);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (type === 'permanent') {
      await db.run("DELETE FROM users WHERE uid = ?", [uid]);
      await db.run("INSERT INTO activity (type, details, timestamp) VALUES (?, ?, ?)", [
        'account_deleted', JSON.stringify({ uid, displayName: user.displayname, type: 'permanent' }), new Date().toISOString()
      ]);
      return res.json({ success: true, message: "Account permanently deleted." });
    } else {
      await db.run("UPDATE users SET is_deleted = 1, deleted_at = ? WHERE uid = ?", [new Date().toISOString(), uid]);
      return res.json({ success: true, message: "Account temporarily deactivated. Contact support to restore." });
    }
  } catch (err) { res.status(500).json({ error: "Deletion failed" }); }
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
  const { school_slug, password } = req.body;
  if (!db) return res.status(500).json({ error: "DB missing" });
  if (!school_slug || !password) return res.status(400).json({ error: "Missing credentials" });
  try {
    const school = await db.get("SELECT * FROM schools WHERE school_slug = ?", [school_slug]);
    if (!school) return res.status(404).json({ error: "School not found" });
    if (school.password !== password) return res.status(401).json({ error: "Invalid password" });
    
    const withdrawals = await db.all("SELECT * FROM withdrawals WHERE school_id = ?", [school.school_id]);
    const students = await db.all(
      "SELECT uid, displayname as displayName, credits, trial_expires_at, expiry_date FROM users WHERE schoolId = ? ORDER BY trial_expires_at DESC",
      [school.school_id]
    );
    const usersRes = await db.get("SELECT COUNT(*) as count FROM users WHERE schoolId = ?", [school.school_id]);

    res.json({
      ...school,
      total_students: school.total_students || 0,
      active_users: usersRes?.count || 0,
      withdrawals,
      students
    });
  } catch (err) { res.status(500).json({ error: "Dashboard failed" }); }
});

app.post("/request-withdrawal", async (req, res) => {
  const { school_id, amount } = req.body;
  if (!db || !school_id || !amount) return res.status(400).json({ error: "Missing data" });
  try {
    const school = await db.get("SELECT total_earnings, bank_name, bank_account_number, bank_account_name FROM schools WHERE school_id = ?", [school_id]);
    if (!school || school.total_earnings < amount) {
      return res.status(400).json({ error: "Insufficient balance" });
    }
    if (!school.bank_name || !school.bank_account_number || !school.bank_account_name) {
      return res.status(400).json({ error: "NO_BANK_DETAILS", message: "Please add your bank account details before requesting a withdrawal." });
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
        displayName: u.displayname || u.displayName || "",
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

app.get("/admin/schools/:school_id/students", authenticateAdmin, async (req: any, res) => {
  if (!db) return res.status(500).json({ error: "DB missing" });
  try {
    const students = await db.all(
      "SELECT uid, displayname as displayName, credits, trial_expires_at, expiry_date FROM users WHERE schoolId = ? ORDER BY trial_expires_at DESC",
      [req.params.school_id]
    );
    res.json(students);
  } catch (err) { res.status(500).json({ error: "Failed to load students" }); }
});

app.delete("/admin/users/:uid", authenticateAdmin, async (req: any, res) => {
  if (!db) return res.status(500).json({ error: "DB missing" });
  try {
    const user = await db.get("SELECT uid, displayname FROM users WHERE uid = ?", [req.params.uid]);
    if (!user) return res.status(404).json({ error: "User not found" });
    await db.run("DELETE FROM users WHERE uid = ?", [req.params.uid]);
    res.json({ success: true, deleted: req.params.uid });
  } catch (err) { res.status(500).json({ error: "Failed to delete user" }); }
});

app.delete("/admin/schools/:school_id", authenticateAdmin, async (req: any, res) => {
  if (!db) return res.status(500).json({ error: "DB missing" });
  try {
    const school = await db.get("SELECT school_id FROM schools WHERE school_id = ?", [req.params.school_id]);
    if (!school) return res.status(404).json({ error: "School not found" });
    await db.run("UPDATE users SET schoolId = NULL WHERE schoolId = ?", [req.params.school_id]);
    await db.run("DELETE FROM withdrawals WHERE school_id = ?", [req.params.school_id]);
    await db.run("DELETE FROM schools WHERE school_id = ?", [req.params.school_id]);
    res.json({ success: true, deleted: req.params.school_id });
  } catch (err) { res.status(500).json({ error: "Failed to delete school" }); }
});

app.get("/admin/withdrawals", authenticateAdmin, async (req, res) => {
  if (!db) return res.status(500).json({ error: "DB missing" });
  try {
    const withdrawals = await db.all("SELECT * FROM withdrawals ORDER BY timestamp DESC");
    const schools = await db.all("SELECT * FROM schools");
    
    const enrichedWithdrawals = withdrawals.map(w => {
      const school = schools.find(s => s.school_id === w.school_id);
      return {
        ...w,
        school_name: school ? school.school_name : "Unknown School",
        bank_name: school?.bank_name || null,
        bank_account_number: school?.bank_account_number || null,
        bank_account_name: school?.bank_account_name || null,
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
    const user = await db.get("SELECT uid, credits, displayname, expiry_date FROM users WHERE uid = ?", [uid]);
    if (!user) return res.status(404).json({ error: "User not found" });

    // Extend expiry: take the later of (existing expiry, now + 30 days)
    const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const existingExpiry = user.expiry_date ? new Date(user.expiry_date) : null;
    const newExpiry = (existingExpiry && existingExpiry > thirtyDaysFromNow ? existingExpiry : thirtyDaysFromNow).toISOString();

    await db.run("UPDATE users SET credits = credits + ?, expiry_date = ? WHERE uid = ?", [credits, newExpiry, uid]);
    const updated = await db.get("SELECT uid, credits, displayname as displayName FROM users WHERE uid = ?", [uid]);
    res.json({
      success: true, uid,
      creditsBefore: user.credits, creditsAfter: updated.credits,
      displayName: updated.displayName,
      expiryDate: newExpiry
    });
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
    const result = await db.run(
      "UPDATE withdrawals SET status = 'approved', approved_at = ? WHERE id = ?",
      [new Date().toISOString(), withdrawal_id]
    );
    if (result.changes === 0) return res.status(404).json({ error: "Withdrawal not found" });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Approval failed" }); }
});

// Save school bank account details
app.post("/api/schools/save-bank-details", async (req, res) => {
  const { school_slug, password, bank_name, bank_account_number, bank_account_name } = req.body;
  if (!db || !school_slug || !password || !bank_name || !bank_account_number || !bank_account_name) {
    return res.status(400).json({ error: "All bank details are required" });
  }
  try {
    const school = await db.get("SELECT * FROM schools WHERE school_slug = ?", [school_slug]);
    if (!school) return res.status(404).json({ error: "School not found" });
    if (school.password !== password) return res.status(401).json({ error: "Invalid password" });
    await db.run(
      "UPDATE schools SET bank_name = ?, bank_account_number = ?, bank_account_name = ? WHERE school_slug = ?",
      [bank_name.trim(), bank_account_number.trim(), bank_account_name.trim(), school_slug]
    );
    res.json({ success: true, message: "Bank details saved successfully" });
  } catch (err) { res.status(500).json({ error: "Failed to save bank details" }); }
});

// --- SUPPORT CHAT ENDPOINT ---
app.post("/api/support/chat", async (req, res) => {
  const { history, message } = req.body;
  if (!message) return res.status(400).json({ error: "message is required" });

  // --- Scripted answers for common questions (always accurate, no AI drift) ---
  // More specific patterns must come before general ones
  const SCRIPTED: { pattern: RegExp; answer: string }[] = [
    {
      pattern: /\bschool.*regist|\bregist.*school|\bschool.*portal|\bown.*portal|\bpartner\b/i,
      answer: `Schools can register on ExamPLE to get their own branded student portal.\n\nBenefits for schools:\n- A unique school link to share with students (exam-ple.xyz/your-school)\n- A referral code to onboard students directly\n- A full admin dashboard to monitor student activity, earnings, and manage your account\n- **40% of every subscription payment made by your students** — paid directly to your school\n- Customise your portal with your school logo, brand colour, tagline, and header image\n\nTo register, tap the Settings icon inside the app and select "Register Your School".`
    },
    {
      pattern: /\bschool.*dashboard|\bdashboard.*login|\bschool.*log.?in|\blog.?in.*school|\baccess.*dashboard|\bschool.*account\b/i,
      answer: `To access your school dashboard:\n\n**Direct URL (fastest):**\nGo to exam-ple.xyz/your-school-slug/dashboard\n(e.g. exam-ple.xyz/kings-college/dashboard)\n\n**Via the app:**\n1. Open the app and tap the Settings icon (top-right)\n2. Scroll down and tap "School Login"\n3. Enter your school slug and password, then tap Login\n\nFrom the dashboard you can:\n- View all enrolled students and their activity\n- See your total earnings and payment history\n- Request withdrawals to your bank account\n- Approve or reject student migration requests\n- Customise your school portal (logo, colour, tagline, header image)\n- Manage bank account details\n\nIf you have forgotten your password, tap "Forgot Password?" on the school login screen.`
    },
    {
      pattern: /\bforgot.*school.*pass|\bschool.*forgot.*pass|\breset.*school.*pass|\bschool.*pass.*reset|\bschool.*password\b/i,
      answer: `To reset your school password:\n\n1. Go to exam-ple.xyz/your-school-slug/dashboard (or tap Settings → School Login in the app)\n2. Tap "Forgot Password?" below the login form\n3. Enter your school's referral code (provided when you first registered)\n4. Enter and confirm your new password\n5. Tap "Reset Password"\n\nYour referral code was given to you when your school was first registered on ExamPLE. If you cannot find it, please contact ExamPLE support for assistance.`
    },
    {
      pattern: /\bschool.*earn|\bschool.*revenue|\bschool.*pay|\bwithdraw|\bbank.*detail|\bschool.*money\b/i,
      answer: `Schools on ExamPLE earn 40% of every subscription payment made by their enrolled students.\n\n**How it works:**\n- When a student linked to your school buys a credit plan, 40% goes to your school's balance automatically\n- Independent students (not linked to any school) do not generate school earnings\n- Your earnings are visible on the school dashboard under "Earnings"\n\n**To withdraw your earnings:**\n1. Log into your dashboard at exam-ple.xyz/your-school-slug/dashboard\n2. Add your bank account details (Bank name, Account number, Account name)\n3. Enter the withdrawal amount and tap "Request Withdrawal"\n4. The ExamPLE team will process the transfer to your account\n\nNote: You must have saved your bank details before you can submit a withdrawal request.`
    },
    {
      pattern: /\bschool.*custom|\bcustom.*school|\blogo.*school|\bschool.*logo|\bschool.*branding|\bschool.*colour|\bschool.*color\b/i,
      answer: `Schools can fully customise their student portal on ExamPLE:\n\n- **Logo:** Upload your school crest or logo — it appears as a watermark on student screens and in the dashboard\n- **Brand colour:** Set your school's primary colour to theme the portal\n- **Tagline:** Add a school motto or welcome message shown to students\n- **Header image:** Upload a banner/cover image displayed at the top of the student portal\n\nTo customise:\n1. Log into your school dashboard at exam-ple.xyz/your-school-slug/dashboard\n2. Tap the "Customise Portal" button\n3. Upload your logo and header image, choose your colour, and save\n\nChanges take effect immediately for all students who visit your school link.`
    },
    {
      pattern: /\bmigration|\bstudent.*join.*school|\bjoin.*school|\blink.*school|\bswitch.*school\b/i,
      answer: `Students who are already using ExamPLE as independent users can request to join a school.\n\n**For students:**\n1. Open the app and tap the Settings icon\n2. Enter your school's referral code in the "Join a School" field\n3. Tap "Request to Join"\n4. Your school administrator will review and approve your request\n5. Once approved, you are linked to the school automatically\n\n**For school administrators:**\nMigration requests from independent students appear in your dashboard under "Student Requests". You can approve or reject each request individually.\n\nNote: Once a student is linked to your school, their future subscription payments will contribute to your school's earnings.`
    },
    {
      pattern: /\bpast.?question|\bpast.?paper|\bprevious.*(question|exam)|\bold.*(question|exam)|\bquestion.*bank|\bpastq\b/i,
      answer: `The Past Question Bank lets you practise with real past exam questions from WAEC, NECO, and JAMB.\n\nHow to use it:\n1. Tap the "Exam Mode" tab at the bottom of the app\n2. Switch the sub-tab at the top from "Practice Test" to "Past Questions"\n3. Select your subject\n4. Pick a year (2015 to 2024 available)\n5. Choose one of two modes:\n   - **Simulate Exam:** Timed, exam-condition experience — answers are hidden until you submit, just like the real thing\n   - **Similar to [Year]:** AI generates fresh questions in the style and difficulty of that year's paper\n6. Tap "Start" to begin\n\nEach question costs 1 credit when starting the exam. Submitting and marking is free.\nYour score and performance are saved automatically to your Progress Tracker.`
    },
    {
      pattern: /\bpractice.*test|\bpractice.*mode|\bpractice.*exam|\bexam.*practice\b/i,
      answer: `Practice Test mode generates AI-powered exam questions tailored to your chosen subject and level.\n\nHow to use it:\n1. Tap the "Exam Mode" tab at the bottom of the app\n2. Make sure the "Practice Test" sub-tab is selected (it is the default)\n3. Enter your subject (e.g. Mathematics, Biology, Government)\n4. Select your exam type — WAEC, NECO, or JAMB\n5. Choose the number of questions (minimum 5, maximum 30) and the time limit\n6. Tap "Start Exam"\n\nCost: 1 credit per question when starting. Submitting and marking is free.\n\nAt the end, you will see your score, correct/incorrect answers with full explanations, and marking schemes. Your results are saved to your Progress Tracker automatically.`
    },
    {
      pattern: /\bexam.*mode|\bhow.*exam|\bstart.*exam|\bexam.*tab|\bexam.*feature|\btimed.*exam\b/i,
      answer: `Exam Mode is where you practise under real exam conditions. It has two sub-modes:\n\n**Practice Test:**\nAI generates fresh questions for any subject you choose. Select your exam type (WAEC, NECO, or JAMB), number of questions (5–30), and your time limit — then start immediately.\n\n**Past Questions:**\nPractise with real past exam questions from 2015–2024. Pick a year, then choose to either simulate the exact exam or get AI-generated questions in that year's style.\n\n**Cost:** 1 credit per question when starting the exam. Submitting and viewing results is free.\n\nTo get started, tap the "Exam Mode" tab at the bottom of the app.`
    },
    {
      pattern: /\bprogress|\btrack.*progress|\bperformance|\bweak.*topic|\bmy.*score|\bmy.*result|\bsubject.*score\b/i,
      answer: `The Progress Tracker shows you exactly how you are performing across all your subjects.\n\nWhat it displays:\n- **Subject scores:** Your average score percentage for each subject you have practised\n- **Weak topics:** The specific topics within each subject where you need the most improvement\n- How your performance changes as you study more\n\nHow to access it:\n1. Log into your ExamPLE account with your Student Code\n2. Tap the "Progress" tab at the bottom of the app\n\nYour tracker is updated automatically every time you complete an exam in Exam Mode. Progress tracking is free — it does not use credits.`
    },
    {
      pattern: /\bai tutor|\bask.*question|\btutor|\bchat.*tab|\bwhat.*can.*ask|\bhow.*tutor\b/i,
      answer: `The AI Tutor is ExamPLE's core learning feature — available 24/7.\n\nWhat you can do:\n- **Ask any academic question** in any subject — Mathematics, Biology, English, Physics, Chemistry, Government, Literature, Economics, and more\n- **Upload an image** of a question from a textbook or exam paper and ask for help\n- **Ask in voice** — tap the microphone icon to speak your question and hear the answer read back to you\n- **Choose Pidgin mode** — toggle to receive explanations in Nigerian Pidgin English if you prefer\n\nCredit usage:\n- Text question: 1 credit\n- Voice explanation: 2 credits\n- Image upload with question: 1 credit\n\nTo use the AI Tutor, tap the "AI Tutor" tab at the bottom of the app after logging in.`
    },
    {
      pattern: /\bpidgin|\bnaija.*language|\bnigerian.*english|\blanguage.*mode\b/i,
      answer: `ExamPLE's AI Tutor supports Nigerian Pidgin English.\n\nTo switch to Pidgin mode:\n1. Open the AI Tutor tab\n2. Look for the language toggle at the top of the chat\n3. Switch it to "Pidgin"\n\nThe AI will then explain topics and answer questions in natural Nigerian Pidgin, making it easier and more relatable for students who think and learn better in Pidgin.\n\nYou can switch back to standard English at any time.`
    },
    {
      pattern: /\bimage|\bphoto|\bpicture|\bupload.*question|\bscan.*question|\bcamera\b/i,
      answer: `You can upload images of questions directly in the AI Tutor.\n\nHow to use it:\n1. Tap the "AI Tutor" tab\n2. Tap the image/attachment icon in the chat input\n3. Select a photo from your gallery or take a picture of a textbook question, exam paper, or any problem you need help with\n4. Add any extra context (e.g. "Solve this" or "Explain step by step") and send\n\nThe AI will analyse the image and provide a detailed explanation.\n\nImage questions cost 1 credit (same as text questions).`
    },
    {
      pattern: /\bvoice|\baudio|\bspeak|\bmicrophone|\blisten\b/i,
      answer: `ExamPLE supports full voice interactions in the AI Tutor.\n\nHow to use voice:\n1. Tap the "AI Tutor" tab\n2. Tap the microphone icon to speak your question\n3. The AI will process your spoken question and read the answer back to you in natural audio\n\nVoice explanations cost 2 credits per interaction (text questions cost 1 credit). The extra cost covers the AI voice generation that speaks the answer back to you.\n\nVoice is perfect for studying on the move, or when you prefer listening over reading.`
    },
    {
      pattern: /\bjoin\b|\bsign.?up\b|\bget started\b|\bcreate.*(account|profile)\b/i,
      answer: `There are two ways to join ExamPLE:\n\n**Option 1 — Via your school:**\nIf your school uses ExamPLE, ask your school administrator for your school link (e.g. exam-ple.xyz/your-school-name) or referral code. Visit the school link and tap "Join" to be automatically connected, or enter the referral code inside Settings after signing up.\n\n**Option 2 — As an independent student:**\nNo school required. Simply:\n1. Visit exam-ple.xyz\n2. Tap the green "Join" button at the top-right\n3. Select "New Student"\n4. Enter your name\n5. You will receive a unique 6-character Student Code immediately\n6. Save your code — it is your login on any device\n\nBoth options give you full access to all ExamPLE features.`
    },
    {
      pattern: /\bforgot\b.*code|lost.*code|recover.*code|find.*code|code.*lost|can.*t.*log.*in|cannot.*log/i,
      answer: `To recover your Student Code:\n\n1. On the login screen, tap "Returning Student"\n2. Tap "Lost your code?"\n3. Enter the full name you registered with\n   - If you joined as an independent student: leave the school field blank\n   - If you joined through a school: also enter your school's slug (e.g. kings-college)\n4. Your code will be retrieved and displayed\n\nIf recovery does not work (e.g. name was entered differently when registering), please contact ExamPLE support.`
    },
    {
      pattern: /\bcredit|\bhow.*work|\bunit|\bcharge|\bcost\b/i,
      answer: `Credits are the currency used across ExamPLE:\n\n- **AI Tutor text question:** 1 credit\n- **AI Tutor voice explanation:** 2 credits\n- **AI Tutor image question:** 1 credit\n- **Exam Mode:** 1 credit per question at the start (e.g. 10 questions = 10 credits)\n- **Submitting and marking your exam:** Free\n- **Progress Tracker:** Free\n\nNew students receive free starter credits when they join. Additional credits are purchased securely via Paystack:\n\n- Top-up: ₦500 for 10 credits (pay as you go)\n- Basic: ₦2,500 for 50 credits (valid 30 days)\n- Premium: ₦4,500 for 100 credits (valid 30 days)\n- Max: ₦6,500 for 250 credits (valid 30 days)\n\nYou will be asked to provide your email address when purchasing, so Paystack can send you a receipt.`
    },
    {
      pattern: /\bpric|\bplan|\bpay|\bsubscri|\bhow much\b/i,
      answer: `ExamPLE offers the following credit plans, all paid securely via Paystack:\n\n- **Top-up:** ₦500 for 10 credits (pay as you go)\n- **Basic:** ₦2,500 for 50 credits (valid 30 days)\n- **Premium:** ₦4,500 for 100 credits (valid 30 days)\n- **Max:** ₦6,500 for 250 credits (valid 30 days)\n\nHow credits are used:\n- AI Tutor text/image question: 1 credit\n- AI Tutor voice explanation: 2 credits\n- Exam Mode: 1 credit per question to start (marking is free)\n- Progress Tracker: free\n\nYou will need to provide your email address at checkout to receive a payment receipt from Paystack. To purchase, tap the credit/buy button inside the app while logged in.`
    },
    {
      pattern: /\bemail|\breceipt|\bpayment.*confirm|\bpaystack.*email\b/i,
      answer: `When you make a payment on ExamPLE, Paystack sends a receipt to your email address.\n\nYou will be asked for your email address the first time you buy credits. It is only used for payment receipts — ExamPLE does not send marketing emails.\n\nIf you have already saved your email, it will be pre-filled on future purchases. You can check or update your saved email in the Settings section of the app.`
    },
    {
      pattern: /\bstudent.*code\b|\bwhat.*code|\bcode.*mean|\bmy.*code\b/i,
      answer: `Your Student Code is a unique 6-character code assigned to you when you join ExamPLE (for example: AB3X7K).\n\nIt is how you log back into your account from any device — treat it like a password.\n\nTo find your code at any time:\n1. Log in to the app\n2. Tap the Settings icon (top-right)\n3. Your code is displayed in the Account section\n\nSave it somewhere safe — in your notes app, a screenshot, or written down. If you lose it, you can try to recover it from the login screen using your name.`
    },
    {
      pattern: /\bdelete.*account|\bclose.*account|\bremove.*account|\bdeactivate\b/i,
      answer: `You can delete or deactivate your ExamPLE account from the Settings section.\n\n**Temporary deactivation:**\nHides your account. You can contact ExamPLE support to restore it later.\n\n**Permanent deletion:**\nCompletely removes all your data. This cannot be undone.\n\nTo do this:\n1. Tap the Settings icon inside the app\n2. Scroll to "Account" and tap "Delete Account"\n3. Choose Temporary or Permanent\n4. Confirm your choice\n\nIf you are linked to a school, your school administrator will no longer see your activity after deletion.`
    },
    {
      pattern: /\bwhat.*feature|\bwhat.*can.*do|\bwhat.*include|\bwhat.*offer|\btell.*me.*about\b/i,
      answer: `ExamPLE is an AI-powered exam preparation platform built specifically for Nigerian students. Here is everything it includes:\n\n**AI Tutor** — available 24/7\n- Ask any academic question by text, voice, or image upload\n- Get step-by-step explanations in English or Nigerian Pidgin\n- Subjects: Mathematics, Biology, Physics, Chemistry, English, Government, Literature, Economics, and more\n- Text/image: 1 credit | Voice: 2 credits\n\n**Exam Mode**\n- *Practice Test:* AI-generated questions for any subject (WAEC, NECO, JAMB) — 1 credit per question\n- *Past Questions:* Real past questions from 2015–2024 — simulate the exact paper or practise in that year's style\n- Full marking schemes and explanations after every exam\n\n**Progress Tracker** — free\n- Subject-by-subject scores and weak topic identification\n- Updated automatically after every exam\n\n**Credit Plans** (via Paystack)\n- Top-up: ₦500/10 credits | Basic: ₦2,500/50 | Premium: ₦4,500/100 | Max: ₦6,500/250\n\n**For Schools**\n- Branded portal (exam-ple.xyz/your-school)\n- Full admin dashboard with student activity, payment history, and earnings\n- 40% revenue share from student subscriptions\n- Customisable logo, colour, tagline, and header image\n- Student migration request management\n\nVisit exam-ple.xyz to get started.`
    },
  ];

  for (const { pattern, answer } of SCRIPTED) {
    if (pattern.test(message)) {
      return res.json({ text: answer });
    }
  }

  // --- AI fallback for all other questions ---
  const SYSTEM_INSTRUCTION = `You are the ExamPLE Support Assistant. ExamPLE is an AI-powered exam preparation platform for Nigerian students (Primary, Secondary, WAEC, NECO, JAMB).

Respond in professional, clear English only. Do not use slang, pidgin, or informal phrases. Keep answers concise and factual.

FEATURES:
1. AI Tutor (main tab) — students ask academic questions by text (1 credit), voice/microphone (2 credits), or image upload (1 credit). Explanations are in English or Nigerian Pidgin (toggle in the app). Available 24/7.
2. Exam Mode — two sub-modes:
   a. Practice Test: AI generates fresh questions. Student picks subject, exam type (WAEC/NECO/JAMB), number of questions (5–30), and time limit. Costs 1 credit per question at the start. Submitting and marking is free.
   b. Past Question Bank: Real past exam questions from 2015–2024. Pick subject and year. Two options: "Simulate Exam" (timed, answers hidden until submit) or "Similar to [Year]" (AI generates questions in that year's style). Also costs 1 credit per question to start.
3. Progress Tracker — tracks subject scores and weak topics after every exam. Free to access. Requires login.

ACCOUNT:
- Students join at exam-ple.xyz — tap Join, select New Student, enter name, receive a unique 6-character Student Code instantly.
- The Student Code is their login on any device. Must be saved safely.
- Students can also join via a school link (exam-ple.xyz/school-slug) or referral code.
- Lost code recovery: tap "Returning Student" then "Lost your code?" on the login screen.
- Account deletion (temporary or permanent) is available in Settings.

CREDITS & PRICING:
- AI Tutor text/image: 1 credit. AI Tutor voice: 2 credits. Exam Mode: 1 credit per question to start (marking is free). Progress Tracker: free.
- New students receive free starter credits.
- Plans (paid securely via Paystack): Top-up ₦500/10 credits, Basic ₦2,500/50 credits (30 days), Premium ₦4,500/100 credits (30 days), Max ₦6,500/250 credits (30 days).
- An email address is required at checkout for Paystack to send a receipt.

SCHOOLS:
- Schools register to get: a branded portal (exam-ple.xyz/school-slug), a referral code, a full admin dashboard, and 40% of every subscription payment made by their enrolled students (60% goes to ExamPLE).
- School dashboard URL: exam-ple.xyz/school-slug/dashboard (direct) or via Settings → School Login in the app.
- Dashboard features: view enrolled students, earnings balance, payment history, withdrawal requests, student migration request approvals, bank account management, and portal customisation (logo, brand colour, tagline, header image).
- Withdrawals: school must add bank details before requesting a withdrawal. ExamPLE team processes the transfer.
- School password reset: go to school dashboard URL → Forgot Password → enter referral code.
- Student migration: independent students can request to join a school via Settings → referral code. School admin approves or rejects from dashboard.
- School portal customisation: logo (shown as watermark), brand colour, tagline, header image — all set from the dashboard.`;

  try {
    const response = await generateWithRetry({
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

// --- 7. GITHUB SYNC STATUS ---
app.get("/api/admin/github-sync-status", (req, res) => {
  const secret = req.headers["x-admin-secret"];
  if (!secret || secret !== ADMIN_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const logPath = path.join(process.cwd(), "logs", "github-sync.log");
  if (!fs.existsSync(logPath)) {
    return res.json({ entries: [], message: "No sync log found — no pushes recorded yet." });
  }
  const raw = fs.readFileSync(logPath, "utf8");
  const blocks = raw.split("---\n").filter(Boolean);
  const entries = blocks.map((block) => {
    const lines = block.trim().split("\n");
    const header = lines[0] || "";
    const isFailed = header.includes("FAILURE");
    const tsMatch = header.match(/\[(.+?)\]/);
    return {
      timestamp: tsMatch ? tsMatch[1] : "unknown",
      status: isFailed ? "failed" : "success",
      detail: lines.slice(1).join("\n").trim() || null,
    };
  });
  const recent = entries.slice(-50).reverse();
  const lastFailure = recent.find((e) => e.status === "failed") || null;
  res.json({ entries: recent, lastFailure });
});

// --- 8. API STATUS ---
app.get("/", (req, res) => {
  res.json({ 
    message: "ExamPLE API is online", 
    status: "ready",
    endpoints: ["/ask-question", "/get-audio", "/register-school", "/school-login"] 
  });
});

// --- 9. GLOBAL ERROR HANDLING ---
process.on("uncaughtException", (err) => { console.error("Uncaught Exception:", err); });
process.on("unhandledRejection", (err) => { console.error("Unhandled Rejection:", err); });

// --- 10. SERVER START (AT THE VERY END) ---
// Wait for DB before binding to port — eliminates cold-start race where
// early requests hit db=null and get a 500 "DB missing" response.
dbReady.then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 ExamPLE running on port ${PORT}`);
  });
});
