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
      const existingFromIp = await db.get("SELECT uid FROM users WHERE created_ip = ? AND schoolid IS NULL", [clientIp]);
      if (existingFromIp && clientIp !== 'unknown') {
        return res.status(429).json({ error: "IP_LIMIT", message: "An account already exists from this network. Please use your existing Student Code to log in." });
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
  const { user_id, questionText, isVoice } = req.body;
  const cost = isVoice ? 2 : 1;
  try {
    const credits = await getUserCredits(user_id);
    if (credits < cost) return res.status(403).json({ error: "Not enough credits" });
    res.setHeader('Content-Type', 'text/event-stream');
    const stream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: questionText }] }],
    });
    for await (const chunk of stream) { if (chunk.text) res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`); }
    if (db) await db.run("UPDATE users SET credits = MAX(0, credits - ?) WHERE uid = ?", [cost, user_id]);
    res.write(`data: [DONE]\n\n`);
    res.end();
  } catch (e) { res.end(); }
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
      answer: `Schools can register on ExamPLE to get their own branded student portal.\n\nBenefits for schools:\n- A unique school link to share with students (exam-ple.xyz/your-school)\n- A referral code to onboard students\n- A dashboard to monitor student activity\n- 40% of subscription revenue from your students\n\nTo register, tap the Settings icon inside the app and select "Register Your School".`
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
      pattern: /\bjoin\b|\bsign.?up\b|\bget started\b|\bcreate.*(account|profile)\b/i,
      answer: `There are two ways to join ExamPLE:\n\n**Option 1 — Via your school:**\nIf your school uses ExamPLE, your school administrator will share a unique link (e.g. exam-ple.xyz/your-school-name). Visit that link and tap "Join" to be automatically connected to your school. Alternatively, open the Settings section inside the app and enter the referral code your school provided.\n\n**Option 2 — As an independent student:**\nYou do not need a school to use ExamPLE. Simply:\n1. Visit exam-ple.xyz\n2. Tap the green "Join" button at the top-right\n3. Select "New Student"\n4. Enter your name\n5. You will receive a unique 6-character Student Code immediately\n6. Save your code and begin learning\n\nNo school link or referral code is required for independent students.`
    },
    {
      pattern: /\bforgot\b.*code|lost.*code|recover.*code|find.*code|code.*lost|can.*t.*log.*in|cannot.*log/i,
      answer: `To recover your Student Code:\n\n1. On the login screen, tap "Returning Student"\n2. Tap "Lost your code?"\n3. Enter your full name\n   - If you joined independently: leave the school field blank\n   - If you joined through a school: also enter your school's slug (e.g. kings-college)\n4. Your code will be retrieved\n\nIf you are still unable to recover it, please contact your school administrator (if applicable) or reach out to ExamPLE support.`
    },
    {
      pattern: /\bcredit|\bhow.*work|\bunit|\bcharge|\bcost\b/i,
      answer: `Credits are the currency used for AI answers on ExamPLE:\n\n- **Text question:** 1 credit\n- **Voice explanation:** 2 credits\n\nNew students receive free starter credits when they join. Additional credits are purchased through one of the plans below:\n\n- Basic: ₦2,500 for 50 credits (30 days)\n- Premium: ₦4,500 for 100 credits (30 days)\n- Max: ₦6,500 for 250 credits (30 days)\n- Top-up: ₦500 for 10 credits (pay as you go)\n\nAll payments are processed securely via Paystack.`
    },
    {
      pattern: /\bpric|\bplan|\bpay|\bsubscri|\bhow much\b/i,
      answer: `ExamPLE offers the following credit plans, all paid securely via Paystack:\n\n- **Basic:** ₦2,500 for 50 credits (valid 30 days)\n- **Premium:** ₦4,500 for 100 credits (valid 30 days)\n- **Max:** ₦6,500 for 250 credits (valid 30 days)\n- **Top-up:** ₦500 for 10 credits (pay as you go, no expiry pressure)\n\nTo purchase, tap the credit/buy button inside the app while logged in.`
    },
    {
      pattern: /\bstudent.*code\b|\bwhat.*code|\bcode.*mean|\bmy.*code\b/i,
      answer: `Your Student Code is a unique 6-character code assigned to you when you join ExamPLE (for example: AB3X7K).\n\nIt is how you log back into your account from any device — similar to a password.\n\nYou can find your code at any time by opening the Settings panel inside the app. Please save it somewhere safe, as losing it may make it harder to recover your account.`
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

Key facts:
- Students can join independently at exam-ple.xyz with no school required — tap Join, select New Student, enter a name, get a 6-character code.
- Students can also join via a school link or referral code (optional).
- Credits: 1 per text question, 2 per voice explanation.
- Plans: Basic ₦2,500/50 credits, Premium ₦4,500/100 credits, Max ₦6,500/250 credits, Top-up ₦500/10 credits.
- Payments via Paystack.
- Schools earn 40% of student subscription revenue.

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
