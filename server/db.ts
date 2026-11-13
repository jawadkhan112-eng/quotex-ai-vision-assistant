import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const isVercel = Boolean(process.env.VERCEL);
const DB_DIR = isVercel ? '/tmp' : path.resolve(process.cwd(), 'data');

if (!fs.existsSync(DB_DIR)) {
  try {
    fs.mkdirSync(DB_DIR, { recursive: true });
  } catch (e) {
    console.warn('Could not create DB_DIR, falling back to /tmp:', e);
  }
}

const DB_PATH = path.join(DB_DIR, 'quotex_algorithmic.db');

export const db = new Database(DB_PATH);

// Local terminal storage. No credentials or provider configuration are persisted.
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

    CREATE TABLE IF NOT EXISTS market_data_cache (
      symbol TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      last_updated TEXT NOT NULL,
      candles_json TEXT NOT NULL,
      source TEXT NOT NULL,
      PRIMARY KEY (symbol, timeframe)
    );

    CREATE TABLE IF NOT EXISTS signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      signal_id TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL,
      symbol TEXT,
      timeframe TEXT NOT NULL,
      signal TEXT NOT NULL,
      confidence INTEGER NOT NULL,
      action_badge TEXT,
      expiry_label TEXT,
      timing_status TEXT NOT NULL,
      entry_window_seconds INTEGER NOT NULL,
      chart_valid INTEGER NOT NULL,
      reasoning TEXT,
      input_source TEXT,
      outcome TEXT,
      outcome_verified_at TEXT
    );

    CREATE TABLE IF NOT EXISTS alert_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      signal_id TEXT NOT NULL,
      channel TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mtg_chains (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      symbol TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      level0_signal TEXT NOT NULL,
      level0_confidence INTEGER NOT NULL,
      level0_outcome TEXT,
      level1_signal TEXT,
      level1_confidence INTEGER,
      level1_outcome TEXT,
      level2_signal TEXT,
      level2_confidence INTEGER,
      level2_outcome TEXT,
      status TEXT NOT NULL,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS candle_decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      decision_id TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL,
      asset TEXT NOT NULL,
      market_type TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      target_candle TEXT NOT NULL,
      prediction TEXT NOT NULL,
      prediction_confidence INTEGER NOT NULL,
      confluence_score INTEGER NOT NULL,
      classification TEXT NOT NULL,
      qualified INTEGER NOT NULL,
      pattern TEXT,
      trend TEXT,
      explanation TEXT,
      wait_reason TEXT,
      data_quality TEXT,
      candles_analyzed INTEGER,
      source TEXT NOT NULL,
      outcome TEXT DEFAULT 'PENDING',
      analysis_version TEXT,
      dedup_key TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS strategy_outcomes (
      decision_id TEXT PRIMARY KEY,
      recorded_at TEXT NOT NULL,
      source TEXT NOT NULL,
      asset TEXT NOT NULL,
      market_type TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      prediction TEXT NOT NULL,
      confluence INTEGER NOT NULL,
      top_strategy_families TEXT NOT NULL,
      market_condition TEXT NOT NULL,
      target_candle TEXT NOT NULL,
      outcome TEXT NOT NULL,
      observed_move REAL
    );

    CREATE TABLE IF NOT EXISTS screenshot_analyses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      source TEXT NOT NULL,
      width INTEGER,
      height INTEGER,
      chart_valid INTEGER NOT NULL,
      chart_score INTEGER,
      signal TEXT NOT NULL,
      confidence INTEGER NOT NULL,
      candles_detected INTEGER,
      candle_quality TEXT,
      reasoning TEXT,
      result_json TEXT NOT NULL
    );
  `);

  // Insert default settings if missing
  const setStmt = db.prepare('INSERT OR IGNORE INTO user_settings (key, value) VALUES (?, ?)');
  setStmt.run('default_symbol', 'EUR/USD (OTC)');
  setStmt.run('default_timeframe', '1M');
  setStmt.run('theme', 'dark');
}

initDb();
