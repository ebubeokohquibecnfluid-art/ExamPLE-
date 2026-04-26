# ExamPLE - AI-Powered Educational Platform for Nigerian Students

## Overview

ExamPLE is an AI-powered educational platform for Nigerian students (Primary, Secondary, and Exam-level: WAEC, NECO, JAMB). It provides AI tutoring, Nigerian-voice audio explanations, Paystack payments, and school referral management with 40/60 revenue sharing.

## Architecture

- **Frontend**: React 19 + TypeScript + Tailwind CSS (via `@tailwindcss/vite`) — hosted on **Vercel**
- **Backend**: Node.js + Express, port 5000 — hosted on **Replit**
- **Database**: PostgreSQL (Replit built-in, persistent across restarts and redeploys)
- **AI**: Google GenAI (`@google/genai`) with `gemini-2.5-flash` (chat/tutoring) and `gemini-2.5-flash-preview-tts` (audio)
- **Payments**: Paystack (webhook at `/api/payments/webhook`, raw body captured for signature verification)
- **Support Bot**: `/api/support/chat` endpoint powered by Gemini 2.5 Flash

## Project Layout

```
.
├── src/
│   ├── App.tsx             # Main React app — all pages, SupportBot widget
│   ├── db.ts               # PostgreSQL database (pg Pool, async wrappers, camelCase remapping)
│   ├── firebase.ts         # Firebase client init (kept for potential future use)
│   ├── index.css           # Global styles
│   ├── main.tsx            # React entry point
│   ├── lib/                # Utilities (tailwind-merge)
│   └── services/           # API service integrations
├── server.ts               # Express backend (all API routes)
├── database.sqlite         # Legacy SQLite file (no longer used — data is in PostgreSQL)
├── firebase-applet-config.json  # Firebase client config
└── package.json
```

## Key Environment Variables (Replit Secrets)

- `GEMINI_API_KEY` — Required for AI tutoring and TTS
- `PAYSTACK_SECRET_KEY` — Payment processing and webhook verification
- `DATABASE_URL`, `PGHOST`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `PGPORT` — Auto-set by Replit PostgreSQL
- `SLACK_WEBHOOK_URL` *(optional)* — If set, GitHub sync failures in `scripts/post-merge.sh` will send a Slack alert

## GitHub Sync Alerts

- `scripts/post-merge.sh` logs every push (success/failure) to `logs/github-sync.log` (git-ignored)
- On failure: error is logged with timestamp + output, Slack alert sent if `SLACK_WEBHOOK_URL` is configured
- Admin endpoint `GET /api/admin/github-sync-status` (requires `X-Admin-Secret` header) returns recent sync history and highlights the last failure

## Vercel Environment Variables

- `VITE_API_URL=https://exam-ple--bubeelyon.replit.app` — Points frontend at the Replit backend

## Deployment Rules

- **Backend changes** → edit `server.ts` on Replit → Publish from Replit
- **Frontend changes** → push only `src/App.tsx` (and other `src/` files) to GitHub → Vercel auto-deploys
- **Never push** `server.ts`, `src/db.ts`, or `package.json` from GitHub to Replit

## Important Notes

- `PORT` is always overridden to `5000` on Replit (GitHub defaults to 3000 — don't let it sync)
- `express.json({ verify })` captures `req.rawBody` for Paystack webhook signature verification — must be kept
- `db.ts` uses PostgreSQL via `pg` Pool. Column names are lowercased by PostgreSQL; `displayname`→`displayName` and `schoolid`→`schoolId` are remapped in the `transformRow` helper
- Admin password: hardcoded as `exam-admin-2026` in `ADMIN_SECRET` env var
- Production URL: `exam-ple--bubeelyon.replit.app`
