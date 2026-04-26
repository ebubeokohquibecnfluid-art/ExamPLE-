import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost')
    ? { rejectUnauthorized: false }
    : false
});

// Convert SQLite-style ? placeholders to PostgreSQL $1, $2, ...
function toPostgres(query: string): string {
  let i = 0;
  return query.replace(/\?/g, () => `$${++i}`);
}

// PostgreSQL lowercases unquoted identifiers — remap back to camelCase for the app
function transformRow(row: any): any {
  if (!row) return null;
  const remap: Record<string, string> = {
    displayname: 'displayName',
    schoolid: 'schoolId'
  };
  const out: any = {};
  for (const [k, v] of Object.entries(row)) {
    out[remap[k] ?? k] = v;
  }
  return out;
}

async function ensureSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      uid TEXT PRIMARY KEY,
      credits INTEGER DEFAULT 10,
      schoolid TEXT,
      expiry_date TEXT,
      display_name TEXT,
      displayname TEXT,
      created_ip TEXT,
      trial_expires_at TEXT
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS created_ip TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_expires_at TEXT;
    CREATE TABLE IF NOT EXISTS schools (
      school_id TEXT PRIMARY KEY,
      school_name TEXT,
      school_slug TEXT UNIQUE,
      password TEXT,
      referral_code TEXT UNIQUE,
      total_students INTEGER DEFAULT 0,
      total_earnings REAL DEFAULT 0,
      bank_name TEXT,
      bank_account_number TEXT,
      bank_account_name TEXT
    );
    ALTER TABLE schools ADD COLUMN IF NOT EXISTS bank_name TEXT;
    ALTER TABLE schools ADD COLUMN IF NOT EXISTS bank_account_number TEXT;
    ALTER TABLE schools ADD COLUMN IF NOT EXISTS bank_account_name TEXT;
    CREATE TABLE IF NOT EXISTS withdrawals (
      id TEXT PRIMARY KEY,
      school_id TEXT,
      amount INTEGER,
      status TEXT DEFAULT 'pending',
      timestamp TEXT,
      approved_at TEXT
    );
    ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS approved_at TEXT;
    CREATE TABLE IF NOT EXISTS activity (
      id SERIAL PRIMARY KEY,
      type TEXT,
      details TEXT,
      timestamp TEXT
    );
    CREATE TABLE IF NOT EXISTS stats (
      key TEXT PRIMARY KEY,
      value REAL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS exam_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      subject TEXT,
      level TEXT,
      exam_type TEXT,
      questions JSONB,
      answers JSONB DEFAULT '{}',
      score INTEGER,
      total INTEGER,
      status TEXT DEFAULT 'active',
      started_at TEXT,
      completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS user_progress (
      id SERIAL PRIMARY KEY,
      user_id TEXT,
      subject TEXT,
      is_correct BOOLEAN,
      topic TEXT,
      timestamp TEXT
    );
  `);
}

let initialized = false;

export async function getDb() {
  if (!initialized) {
    await ensureSchema();
    initialized = true;
    console.log('✅ PostgreSQL schema ready');
  }

  return {
    get: async (query: string, params: any[] = []): Promise<any> => {
      try {
        const result = await pool.query(toPostgres(query), params);
        return result.rows.length > 0 ? transformRow(result.rows[0]) : null;
      } catch (e) { console.error('db.get error:', e); return null; }
    },

    run: async (query: string, params: any[] = []): Promise<any> => {
      try {
        const result = await pool.query(toPostgres(query), params);
        return { changes: result.rowCount ?? 0 };
      } catch (e) { console.error('db.run error:', e); return { changes: 0 }; }
    },

    all: async (query: string, params: any[] = []): Promise<any[]> => {
      try {
        const result = await pool.query(toPostgres(query), params);
        return result.rows.map(transformRow);
      } catch (e) { console.error('db.all error:', e); return []; }
    },

    exec: async (query: string): Promise<void> => {
      try {
        await pool.query(query);
      } catch (e) { console.error('db.exec error:', e); }
    }
  };
}
