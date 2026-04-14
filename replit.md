# ExamPLE - AI-Powered Educational Platform for Nigerian Students

## Overview

ExamPLE is an AI-powered educational platform tailored for Nigerian students (Primary, Secondary, and Exam-level: WAEC, NECO, JAMB). It provides AI-driven explanations and audio tutoring using Google's Gemini API, with a "Nigerian teacher" persona and support for Nigerian Pidgin.

## Architecture

- **Frontend**: React 19 + TypeScript + Tailwind CSS v3 + Vite, running on port 5000
- **Backend**: Node.js + Express, running on port 3001 (dev) or 5000 (prod)
- **Database**: SQLite via `better-sqlite3` for users, schools, withdrawals
- **AI**: Google GenAI (`@google/genai@0.7.0`) with `gemini-1.5-flash`
- **Payments**: Paystack for subscriptions/credits
- **Auth/Realtime**: Firebase/Firestore for user auth and real-time sync

## Project Layout

```
.
├── src/                    # Frontend React source
│   ├── App.tsx             # Main app with all routes/components
│   ├── db.ts               # SQLite database setup (better-sqlite3)
│   ├── firebase.ts         # Firebase initialization
│   ├── index.css           # Global styles (Tailwind v3)
│   ├── main.tsx            # React entry point
│   ├── lib/                # Utilities (tailwind-merge)
│   └── services/           # API service integrations
├── server.ts               # Express backend
├── index.html              # HTML entry point
├── vite.config.ts          # Vite config (port 5000, proxy to 3001)
├── tailwind.config.js      # Tailwind v3 config
├── postcss.config.js       # PostCSS config
└── package.json
```

## Development

Run both frontend and backend simultaneously:
```bash
npm run dev
```
- Frontend at http://localhost:5000 (Vite dev server)
- Backend API at http://localhost:3001 (Express)
- Vite proxies `/api`, `/ask-question`, `/get-audio`, `/register-school`, `/payment-success` to backend

## Environment Variables

Set via Replit Secrets panel:
- `GEMINI_API_KEY` or `REAL_GEMINI_KEY` - Required for AI features
- `PAYSTACK_SECRET_KEY` - For payment processing  
- `PAYSTACK_PUBLIC_KEY` - For payment processing
- `VITE_API_URL` - Leave empty for relative URLs (proxy handles it in dev)
- `APP_URL` - Production URL for payment callbacks

## Key Notes

- **Tailwind**: Uses v3 (not v4) because `@tailwindcss/vite` uses Rust binaries that crash on this environment
- **better-sqlite3**: Used instead of `sqlite`/`sqlite3` (native module compatibility)
- **@google/genai**: Pinned to v0.7.0 for Node 20/22 ESM compatibility
- **motion**: `framer-motion` must be fully installed for ESM resolution to work with the `motion` package

## Deployment

- **Target**: Autoscale
- **Build**: `npm run build` (Vite builds frontend to `dist/`)
- **Run**: `node --experimental-strip-types server.ts`
- In production, Express serves the Vite build from `dist/` and the server binds to `0.0.0.0:5000`
