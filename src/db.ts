import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let db: Database.Database | null = null;

export async function getDb() {
  if (db) return db;

  const dbPath = process.env.DB_PATH
    || (process.env.NODE_ENV === 'production' ? '/home/user/database.sqlite' : path.join(__dirname, '..', 'database.sqlite'));

  db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (uid TEXT PRIMARY KEY, credits INTEGER DEFAULT 10, schoolId TEXT, expiry_date TEXT);
    CREATE TABLE IF NOT EXISTS schools (school_id TEXT PRIMARY KEY, school_name TEXT, school_slug TEXT UNIQUE, password TEXT, referral_code TEXT UNIQUE, total_students INTEGER DEFAULT 0, total_earnings INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS withdrawals (id TEXT PRIMARY KEY, school_id TEXT, school_name TEXT, amount INTEGER, status TEXT DEFAULT 'pending', timestamp DATETIME DEFAULT CURRENT_TIMESTAMP);
  `);

  return db;
}
