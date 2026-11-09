import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const DB_PATH = path.join(DB_DIR, 'quotex_vision.db');

export const db = new Database(DB_PATH);

// Initialize SQLite Schema
export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS analysis_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      symbol TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      signal TEXT NOT NULL,
      evidence_score INTEGER NOT NULL,
      chart_readable INTEGER NOT NULL,
      trend TEXT,
      momentum TEXT,
      candle_observation TEXT,
      visible_indicators TEXT,
      support_resistance TEXT,
      reasons TEXT,
      opposing_evidence TEXT,
      conflicts TEXT,
      invalidation TEXT,
      risk_notes TEXT,
      image_path TEXT,
      model_used TEXT NOT NULL,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS backtest_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      symbol TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      total_candles INTEGER NOT NULL,
      total_signals INTEGER NOT NULL,
      call_count INTEGER NOT NULL,
      put_count INTEGER NOT NULL,
      wait_count INTEGER NOT NULL,
      win_count INTEGER NOT NULL,
      loss_count INTEGER NOT NULL,
      win_rate REAL NOT NULL,
      profit_factor REAL NOT NULL,
      expectancy REAL NOT NULL,
      max_drawdown REAL NOT NULL,
      config_json TEXT NOT NULL
    );
  `);

  // Insert default settings if missing
  const setStmt = db.prepare('INSERT OR IGNORE INTO user_settings (key, value) VALUES (?, ?)');
  setStmt.run('ai_provider', 'gemini');
  setStmt.run('model_name', 'gemini-3.8-flash');
  setStmt.run('default_symbol', 'EUR/USD (OTC)');
  setStmt.run('default_timeframe', '1M');
  setStmt.run('auto_save_screenshots', 'true');
  setStmt.run('evidence_threshold', '65');
  setStmt.run('theme', 'dark');
}

initDb();
