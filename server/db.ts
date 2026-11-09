import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const isVercel = Boolean(process.env.VERCEL);
const DB_DIR = isVercel ? '/tmp' : path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
if (isVercel && !process.env.DATABASE_URL) {
  console.warn('DATABASE_URL is not configured: SQLite on /tmp is ephemeral and not suitable for persistent production history.');
}
const DB_PATH = path.join(DB_DIR, 'quotex_vision.db');
export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS analysis_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT NOT NULL, symbol TEXT NOT NULL, timeframe TEXT NOT NULL,
      signal TEXT NOT NULL, evidence_score INTEGER NOT NULL, chart_readable INTEGER NOT NULL, trend TEXT, momentum TEXT,
      candle_observation TEXT, visible_indicators TEXT, support_resistance TEXT, reasons TEXT, opposing_evidence TEXT,
      conflicts TEXT, invalidation TEXT, risk_notes TEXT, image_path TEXT, model_used TEXT NOT NULL, notes TEXT
    );
    CREATE TABLE IF NOT EXISTS user_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS backtest_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT NOT NULL, symbol TEXT NOT NULL, timeframe TEXT NOT NULL,
      total_candles INTEGER NOT NULL, total_signals INTEGER NOT NULL, call_count INTEGER NOT NULL, put_count INTEGER NOT NULL,
      wait_count INTEGER NOT NULL, win_count INTEGER NOT NULL, loss_count INTEGER NOT NULL, win_rate REAL NOT NULL,
      profit_factor REAL NOT NULL, expectancy REAL NOT NULL, max_drawdown REAL NOT NULL, config_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS provider_credentials (
      provider TEXT PRIMARY KEY, encrypted_key TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS provider_settings (provider TEXT PRIMARY KEY, model TEXT NOT NULL);
  `);
  const defaults = db.prepare('INSERT OR IGNORE INTO user_settings (key, value) VALUES (?, ?)');
  defaults.run('ai_provider', 'gemini'); defaults.run('model_name', process.env.GEMINI_MODEL || 'gemini-2.0-flash');
  defaults.run('default_symbol', 'EUR/USD (OTC)'); defaults.run('default_timeframe', '1M');
  defaults.run('auto_save_screenshots', 'true'); defaults.run('evidence_threshold', '65'); defaults.run('theme', 'dark');
}
initDb();
