import express from "express";

const app = express();
// Cloud Run provides PORT=8080. Local preview uses 3000.
const PORT = parseInt(process.env.PORT || "3000", 10);

console.log(`[BOOT] Initializing ExamPLE on port ${PORT}...`);

// --- STEP 1: LISTEN IMMEDIATELY ---
// We listen before loading any heavy modules (Vite, Gemini, etc.)
// This satisfies Cloud Run's health check in milliseconds.
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 [BOOT] Server is now listening on port ${PORT}`);
});

// --- STEP 2: IMMEDIATE HEALTH CHECKS ---
app.get("/health", (req, res) => res.status(200).send("OK"));
app.get("/", (req, res) => {
  // If we are in production, we'll eventually serve the frontend here.
  // For the first few seconds of boot, we just send a "Live" message.
  res.status(200).send("ExamPLE API is Live and Booting... 🚀");
});

async function startServer() {
  try {
    console.log("[BOOT] Loading heavy modules...");
    
    // Dynamic imports to keep the initial boot light
    const path = await import("path");
    const fs = await import("fs");
    const axios = (await import("axios")).default;
    const { GoogleGenAI, Modality } = await import("@google/genai");
    const { createServer as createViteServer } = await import("vite");

    console.log("[BOOT] Modules loaded. Initializing middleware...");

    app.use(express.json({ limit: '50mb' }));
    app.set('trust proxy', 1);

    const apiKey = (process.env.REAL_GEMINI_KEY || process.env.GEMINI_API_KEY || "").trim();
    const ai = new GoogleGenAI({ apiKey });

    // Load DB
    const { getDb } = await import("./src/db.js").catch(err => {
      console.error("❌ [BOOT] Database module failed:", err);
      return { getDb: async () => null };
    });
    
    const db = await getDb();
    if (!db) console.warn("⚠️ [BOOT] Database unavailable.");

    const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
    const PLAN_PRICES: Record<string, number> = { 'Small': 500, 'Medium': 1000, 'Large': 2000 };

    // Helper to get user credits
    const getUserCredits = async (userId: string) => {
      if (!db) return 10;
      try {
        const user = await db.get("SELECT credits FROM users WHERE uid = ?", [userId]);
        return user ? user.credits : 10;
      } catch (e) { return 10; }
    };

    // --- API ROUTES ---
    
    app.post("/api/auth/simple", async (req, res) => {
      const { uid } = req.body;
      if (!uid || !db) return res.status(400).json({ error: "UID required" });
      try {
        const user = await db.get("SELECT * FROM users WHERE uid = ?", [uid]);
        if (!user) await db.run("INSERT INTO users (uid, credits) VALUES (?, ?)", [uid, 10]);
        res.json(await db.get("SELECT * FROM users WHERE uid = ?", [uid]));
      } catch (err) { res.status(500).json({ error: "Auth failed" }); }
    });

    app.post("/api/payments/initialize", async (req, res) => {
      const { email, amount, userId, planName } = req.body;
      if (PAYSTACK_SECRET === "sk_test_examPLE_demo_key_999") {
        return res.json({ status: true, data: { authorization_url: `${process.env.APP_URL || ''}/payment-success?demo=true&userId=${userId}&credits=${PLAN_PRICES[planName] || 0}` } });
      }
      if (!PAYSTACK_SECRET) return res.status(500).json({ error: "Paystack not configured" });
      try {
        const response = await axios.post("https://api.paystack.co/transaction/initialize", {
          email, amount: amount * 100, metadata: { userId, planName, credits: PLAN_PRICES[planName] || 0 },
          callback_url: `${process.env.APP_URL}/payment-success`
        }, { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } });
        res.json(response.data);
      } catch (err) { res.status(500).json({ error: "Payment failed" }); }
    });

    app.get("/payment-success", async (req, res) => {
      const { demo, userId, credits } = req.query;
      if (demo === "true" && userId && credits && db) {
        await db.run("UPDATE users SET credits = credits + ? WHERE uid = ?", [Number(credits), userId]);
      }
      const distPath = path.join(process.cwd(), "dist");
      if (fs.existsSync(distPath)) res.sendFile(path.join(distPath, "index.html"));
      else res.send("Payment Successful!");
    });

    app.post("/ask-question", async (req, res) => {
      const { user_id, level, subject, questionText, usePidgin, imageBase64 } = req.body;
      try {
        const credits = await getUserCredits(user_id);
        if (credits < 1) return res.status(403).json({ error: "No credits" });

        res.setHeader('Content-Type', 'text/event-stream');
        const stream = await ai.models.generateContentStream({
          model: "gemini-3.1-flash-lite-preview",
          contents: [{ role: "user", parts: [{ text: `Level: ${level}, Subject: ${subject}, Question: ${questionText}` }] }],
        });

        for await (const chunk of stream) {
          if (chunk.text) res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
        }
        if (db) await db.run("UPDATE users SET credits = MAX(0, credits - 1) WHERE uid = ?", [user_id]);
        res.write(`data: [DONE]\n\n`);
        res.end();
      } catch (err) { res.end(); }
    });

    // --- FRONTEND SERVING ---
    if (process.env.NODE_ENV !== "production") {
      const vite = await createViteServer({ server: { middlewareMode: true, hmr: false }, appType: "spa" });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      // Overwrite the temporary "/" route with the real frontend
      app.get("*", (req, res) => {
        const indexPath = path.join(distPath, "index.html");
        if (fs.existsSync(indexPath)) res.sendFile(indexPath);
        else res.status(404).send("Frontend not built yet.");
      });
    }

    console.log("✅ [BOOT] Server fully initialized.");
  } catch (err) {
    console.error("❌ [BOOT] Fatal error during background boot:", err);
  }
}

startServer();
