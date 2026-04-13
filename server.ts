import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Modality } from "@google/genai";
import fs from "fs";
import axios from "axios";

const app = express();
const PORT = Number(process.env.PORT) || 8080;

// --- STEP 1: START LISTENING IMMEDIATELY ---
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server is listening on port ${PORT}`);
});

app.get("/health", (req, res) => res.send("OK"));

async function startServer() {
  try {
    const { getDb } = await import("./src/db.js").catch(err => {
      console.error("❌ Database module failed to load:", err);
      return { getDb: async () => null };
    });

    app.use(express.json({ limit: '50mb' }));
    app.set('trust proxy', 1);

    const apiKey = (process.env.REAL_GEMINI_KEY || process.env.GEMINI_API_KEY || "").trim();
    const ai = new GoogleGenAI({ apiKey });
    const db = await getDb();

    const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
    const PLAN_PRICES: Record<string, number> = { 'Small': 500, 'Medium': 1000, 'Large': 2000 };

    // --- PAYSTACK INITIALIZE (With Demo Mode) ---
    app.post("/api/payments/initialize", async (req, res) => {
      const { email, amount, userId, planName } = req.body;

      // Check if we are in Demo Mode
      if (PAYSTACK_SECRET === "sk_test_examPLE_demo_key_999") {
        console.log("🛠️ DEMO MODE: Simulating Paystack Initialization");
        return res.json({
          status: true,
          data: {
            authorization_url: `${process.env.APP_URL || ''}/payment-success?demo=true&userId=${userId}&credits=${PLAN_PRICES[planName] || 0}`,
            access_code: "demo_access_code"
          }
        });
      }

      if (!PAYSTACK_SECRET) return res.status(500).json({ error: "Paystack not configured" });

      try {
        const response = await axios.post("https://api.paystack.co/transaction/initialize", {
          email, amount: amount * 100, metadata: { userId, planName, credits: PLAN_PRICES[planName] || 0 },
          callback_url: `${process.env.APP_URL}/payment-success`
        }, { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}`, "Content-Type": "application/json" } });
        res.json(response.data);
      } catch (err) { res.status(500).json({ error: "Payment failed" }); }
    });

    // --- PAYMENT SUCCESS (Handles Demo Redirect) ---
    app.get("/payment-success", async (req, res) => {
      const { demo, userId, credits } = req.query;

      if (demo === "true" && userId && credits && db) {
        console.log(`🛠️ DEMO MODE: Adding ${credits} credits to ${userId}`);
        await db.run("UPDATE users SET credits = credits + ? WHERE uid = ?", [Number(credits), userId]);
      }

      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });

    // ... [Keep all your other routes here] ...

    if (process.env.NODE_ENV !== "production") {
      const vite = await createViteServer({ server: { middlewareMode: true, hmr: false }, appType: "spa" });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
    }
  } catch (err) { console.error("Startup error:", err); }
}

startServer();
