import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let db: Database.Database | null = null;

function getConnection(): Database.Database {
  if (db) return db;

  const dbPath = process.env.DB_PATH
    || (process.env.NODE_ENV === 'production'
      ? '/home/user/database.sqlite'
      : path.join(__dirname, '..', 'database.sqlite'));

  db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (uid TEXT PRIMARY KEY, credits INTEGER DEFAULT 10, schoolId TEXT, expiry_date TEXT);
    CREATE TABLE IF NOT EXISTS schools (school_id TEXT PRIMARY KEY, school_name TEXT, school_slug TEXT UNIQUE, password TEXT, referral_code TEXT UNIQUE, total_students INTEGER DEFAULT 0, total_earnings REAL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS withdrawals (id TEXT PRIMARY KEY, school_id TEXT, amount INTEGER, status TEXT DEFAULT 'pending', timestamp DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS activity (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, details TEXT, timestamp TEXT);
    CREATE TABLE IF NOT EXISTS stats (key TEXT PRIMARY KEY, value REAL DEFAULT 0);
  `);

  // Safe migrations
  try { db.prepare("ALTER TABLE schools ADD COLUMN total_earnings REAL DEFAULT 0").run(); } catch (_) {}
  try { db.prepare("ALTER TABLE users ADD COLUMN expiry_date TEXT").run(); } catch (_) {}
  try { db.prepare("ALTER TABLE users ADD COLUMN displayName TEXT").run(); } catch (_) {}
  try { db.prepare("ALTER TABLE withdrawals ADD COLUMN timestamp DATETIME DEFAULT CURRENT_TIMESTAMP").run(); } catch (_) {}

  return db;
}

export const asyncDb = {
  get: async (query: string, params: any[] = []): Promise<any> => {
    try {
      return getConnection().prepare(query).get(...params) ?? null;
    } catch (e) { console.error("db.get error", e); return null; }
  },

  run: async (query: string, params: any[] = []): Promise<any> => {
    try {
      return getConnection().prepare(query).run(...params);
    } catch (e) { console.error("db.run error", e); return { changes: 0 }; }
  },

  all: async (query: string, params: any[] = []): Promise<any[]> => {
    try {
      return getConnection().prepare(query).all(...params);
    } catch (e) { console.error("db.all error", e); return []; }
  },

  exec: async (query: string): Promise<void> => {
    try {
      getConnection().exec(query);
    } catch (e) { console.error("db.exec error", e); }
  }
};

export async function getDb() {
  getConnection(); // ensure initialized
  return asyncDb;
}
