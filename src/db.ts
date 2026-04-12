import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

let db: any = null;

export async function getDb() {
  if (db) return db;
  
  // Use /tmp directory for Cloud Run compatibility
  const dbPath = process.env.NODE_ENV === 'production' 
    ? '/tmp/database.sqlite' 
    : './database.sqlite';

  db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (uid TEXT PRIMARY KEY, credits INTEGER DEFAULT 10, schoolId TEXT);
    CREATE TABLE IF NOT EXISTS schools (school_id TEXT PRIMARY KEY, school_name TEXT, school_slug TEXT UNIQUE, password TEXT, referral_code TEXT UNIQUE, total_students INTEGER DEFAULT 0, total_earnings INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS withdrawals (id TEXT PRIMARY KEY, school_id TEXT, school_name TEXT, amount INTEGER, status TEXT DEFAULT 'pending', timestamp DATETIME DEFAULT CURRENT_TIMESTAMP);
  `);

  return db;
}
