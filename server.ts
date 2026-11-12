import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { db } from './server/db.js';
import { analyzeAlgorithmic, reportSignalOutcome, resetMtgState } from './server/algorithmicEngine.js';
import { analyzeProviderCandles, PROVIDER_ENGINE_VERSION, type ProviderCandle } from './server/modules/signalProviderIntelligence.js';

dotenv.config();
const app = express(); const PORT = process.env.PORT || 3000; const isVercel = Boolean(process.env.VERCEL);
app.use((req: Request, res: Response, next: NextFunction) => { const id = crypto.randomUUID(); res.setHeader('X-Request-Id', id); next(); });
app.use(cors()); app.use(express.json({ limit: '8mb' }));

app.get('/api/health', (_req, res) => res.json({ status: 'OK', app: 'Quotex Algorithmic Trading Terminal', version: '3.0.0', mode: 'LOCAL_ALGORITHMIC_ANALYSIS', environment: isVercel ? 'vercel-serverless' : 'standalone-node', externalApiCalls: false, timestamp: new Date().toISOString() }));

app.post('/api/analyze-algorithmic', (req, res) => {
  const { prices, candles, timeframe = '1M', frame } = req.body || {};
  if ((!Array.isArray(prices) || prices.length < 2) && !frame) return res.status(400).json({ success: false, error: 'Provide at least two finite closing prices or a chart frame.' });
  try {
    const result = analyzeAlgorithmic({ prices: Array.isArray(prices) ? prices : [], candles: Array.isArray(candles) ? candles : undefined, timeframe, frame });
    try { db.prepare('INSERT INTO analysis_history (timestamp, symbol, timeframe, signal, evidence_score, chart_readable, candle_observation, reasons) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(result.analysisTimestamp, req.body.symbol || 'Local chart', timeframe, result.signal, result.confidenceScore, 1, result.candleObservation, JSON.stringify([result.reasoning])); } catch { /* history is optional */ }
    res.json({ success: true, result, local: true });
  } catch (error: any) { res.status(400).json({ success: false, error: error.message || 'Algorithmic analysis failed.' }); }
});

/**
 * Signal Provider Intelligence — candle-by-candle directional decision.
 * Shared by LIVE and SCREENSHOT analysis (same engine, only input differs).
 * Does NOT auto-persist a decision; persistence happens via /api/decisions so
 * duplicate prevention and target-candle bookkeeping stay explicit.
 */
app.post('/api/provider-analysis', (req, res) => {
  const { completed, developing, window, asset = 'UNKNOWN', marketType = 'UNKNOWN', timeframe = 'UNKNOWN', source = 'LIVE' } = req.body || {};
  if (!Array.isArray(completed) || completed.length < 3) {
    return res.status(400).json({ success: false, error: 'Provide at least 3 completed candles (open/high/low/close objects).' });
  }
  try {
    const validCompleted = (completed as ProviderCandle[]).filter((c) =>
      c && Number.isFinite(c.open) && Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close));
    if (validCompleted.length < 3) return res.status(400).json({ success: false, error: 'Completed candles must contain finite open/high/low/close.' });
    const decision = analyzeProviderCandles({ completed: validCompleted, developing, window: window === 10 ? 10 : 5 });
    res.json({ success: true, decision, meta: { asset, marketType, timeframe, source, analysisVersion: PROVIDER_ENGINE_VERSION } });
  } catch (error: any) { res.status(400).json({ success: false, error: error.message || 'Provider analysis failed.' }); }
});

// Persist a candle decision with duplicate prevention (one decision per asset+
// market+timeframe+target candle+algorithm version).
app.post('/api/decisions', (req, res) => {
  const { decision, meta } = req.body || {};
  if (!decision || !meta) return res.status(400).json({ success: false, error: 'Provide decision and meta.' });
  const dedupKey = `${meta.asset}|${meta.marketType}|${meta.timeframe}|${meta.targetCandle ?? 'unknown'}|${decision.analysisVersion ?? PROVIDER_ENGINE_VERSION}`;
  const decisionId = `DEC-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    db.prepare(`INSERT INTO candle_decisions (decision_id, created_at, asset, market_type, timeframe, target_candle, prediction, prediction_confidence, confluence_score, classification, qualified, pattern, trend, explanation, wait_reason, data_quality, candles_analyzed, source, outcome, analysis_version, dedup_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`)
      .run(decisionId, new Date().toISOString(), meta.asset ?? 'UNKNOWN', meta.marketType ?? 'UNKNOWN', meta.timeframe ?? 'UNKNOWN',
        String(meta.targetCandle ?? 'unknown'), decision.prediction, decision.predictionConfidence ?? 0, decision.confluenceScore ?? 0,
        decision.classification ?? 'LOW CONFIDENCE', decision.qualified ? 1 : 0, decision.patternName ?? null, decision.trend ?? null,
        decision.explanation ?? null, decision.waitReason ?? null, decision.dataQuality ?? null, decision.candlesAnalyzed ?? null,
        meta.source ?? 'LIVE', decision.analysisVersion ?? PROVIDER_ENGINE_VERSION, dedupKey);
    res.json({ success: true, decisionId, duplicate: false });
  } catch (error: any) {
    if (String(error.message).includes('UNIQUE')) return res.json({ success: true, decisionId: null, duplicate: true });
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/decisions', (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
    const rows = db.prepare('SELECT * FROM candle_decisions ORDER BY id DESC LIMIT ?').all(limit);
    res.json({ success: true, decisions: rows });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

// Martingale (MTG) tracking: report the WIN/LOSS outcome of the last signal so the
// next analysis is tagged with the correct MTG level.
app.post('/api/signal-outcome', (req, res) => {
  const { outcome } = req.body || {};
  if (outcome !== 'WIN' && outcome !== 'LOSS') return res.status(400).json({ success: false, error: "outcome must be 'WIN' or 'LOSS'." });
  reportSignalOutcome(outcome);
  res.json({ success: true, local: true });
});
app.post('/api/mtg-reset', (_req, res) => { resetMtgState(); res.json({ success: true, local: true }); });

// ---- MTG (Martingale) persistent recovery chains ----
// A chain records the original signal (level 0) and up to two visually verified
// recovery steps. Outcomes must be explicitly reported; nothing is auto-won.
app.post('/api/mtg/start', (req, res) => {
  const { symbol = 'Local chart', timeframe = '1M', signal, confidence } = req.body || {};
  if (signal !== 'CALL' && signal !== 'PUT' && signal !== 'WAIT') return res.status(400).json({ success: false, error: 'signal must be CALL, PUT or WAIT.' });
  try {
    const now = new Date().toISOString();
    const info = db.prepare("INSERT INTO mtg_chains (created_at, updated_at, symbol, timeframe, level0_signal, level0_confidence, level0_outcome, status) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', 'PENDING')").run(now, now, String(symbol), String(timeframe), signal, Math.max(0, Math.min(100, Number(confidence) || 0)));
    const chain = db.prepare('SELECT * FROM mtg_chains WHERE id = ?').get(info.lastInsertRowid);
    res.json({ success: true, chain, local: true });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

app.post('/api/mtg/:id/step', (req, res) => {
  const { signal, confidence, outcome } = req.body || {};
  try {
    const chain: any = db.prepare('SELECT * FROM mtg_chains WHERE id = ?').get(req.params.id);
    if (!chain) return res.status(404).json({ success: false, error: 'MTG chain not found.' });
    const now = new Date().toISOString();
    // Find the first unresolved level for this chain and record the step + outcome.
    if (chain.level0_outcome === 'PENDING' || chain.level0_outcome === null) {
      db.prepare("UPDATE mtg_chains SET level0_outcome = ?, level1_signal = ?, level1_confidence = ?, level1_outcome = 'PENDING', updated_at = ? WHERE id = ?").run(outcome === 'WIN' || outcome === 'LOSS' ? outcome : 'PENDING', signal ?? null, Number(confidence) || null, now, chain.id);
    } else if (chain.level1_outcome === 'PENDING' || chain.level1_outcome === null) {
      db.prepare("UPDATE mtg_chains SET level1_outcome = ?, level2_signal = ?, level2_confidence = ?, level2_outcome = 'PENDING', updated_at = ? WHERE id = ?").run(outcome === 'WIN' || outcome === 'LOSS' ? outcome : 'PENDING', signal ?? null, Number(confidence) || null, now, chain.id);
    } else if (chain.level2_outcome === 'PENDING' || chain.level2_outcome === null) {
      db.prepare("UPDATE mtg_chains SET level2_outcome = ?, status = CASE WHEN ? = 'WIN' THEN 'COMPLETED' ELSE 'FAILED' END, updated_at = ? WHERE id = ?").run(outcome === 'WIN' || outcome === 'LOSS' ? outcome : 'PENDING', outcome, now, chain.id);
    } else {
      return res.status(400).json({ success: false, error: 'MTG chain already resolved.' });
    }
    const updated = db.prepare('SELECT * FROM mtg_chains WHERE id = ?').get(chain.id);
    res.json({ success: true, chain: updated, local: true });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

app.get('/api/mtg', (req, res) => {
  try {
    const chains = db.prepare('SELECT * FROM mtg_chains ORDER BY id DESC LIMIT ?').all(Math.min(Number(req.query.limit) || 50, 200));
    const stats = db.prepare("SELECT status, COUNT(*) AS count FROM mtg_chains GROUP BY status").all();
    res.json({ success: true, chains, stats, local: true });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

app.delete('/api/mtg/:id', (req, res) => {
  try { db.prepare('DELETE FROM mtg_chains WHERE id = ?').run(req.params.id); res.json({ success: true }); } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

// ---- Screenshot analysis records ----
app.post('/api/screenshots', (req, res) => {
  const { source = 'UPLOAD', width, height, result } = req.body || {};
  if (!result) return res.status(400).json({ success: false, error: 'analysis result is required.' });
  try {
    const info = db.prepare('INSERT INTO screenshot_analyses (created_at, source, width, height, chart_valid, chart_score, signal, confidence, candles_detected, candle_quality, reasoning, result_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      new Date().toISOString(), String(source), Number(width) || null, Number(height) || null,
      result.chartDetection?.isChart ? 1 : 0, result.chartDetection?.score ?? null,
      result.signal ?? 'WAIT', result.confidenceScore ?? 0,
      result.reconstructedCandleCount ?? null, result.reconstructionQuality ?? null,
      result.reasoning ?? '', JSON.stringify(result)
    );
    const record = db.prepare('SELECT * FROM screenshot_analyses WHERE id = ?').get(info.lastInsertRowid);
    res.json({ success: true, record, local: true });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

app.get('/api/screenshots', (req, res) => {
  try {
    const rows = db.prepare('SELECT id, created_at, source, width, height, chart_valid, chart_score, signal, confidence, candles_detected, candle_quality, reasoning FROM screenshot_analyses ORDER BY id DESC LIMIT ?').all(Math.min(Number(req.query.limit) || 50, 200));
    res.json({ success: true, screenshots: rows, local: true });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

app.delete('/api/screenshots/:id', (req, res) => {
  try { db.prepare('DELETE FROM screenshot_analyses WHERE id = ?').run(req.params.id); res.json({ success: true }); } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

// ---- Signal records: unique-ID persistence, outcome verification ----
app.post('/api/signals', (req, res) => {
  const { result, symbol, inputSource = 'LIVE_FRAME' } = req.body || {};
  if (!result?.signalId || !result?.signal) return res.status(400).json({ success: false, error: 'A valid analysis result with signalId and signal is required.' });
  try {
    db.prepare("INSERT OR IGNORE INTO signals (signal_id, created_at, symbol, timeframe, signal, confidence, action_badge, expiry_label, timing_status, entry_window_seconds, chart_valid, reasoning, input_source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      String(result.signalId), new Date().toISOString(), symbol ?? null, String(result.detectedTimeframe ?? '1M'),
      result.signal, result.confidenceScore ?? 0, result.actionBadge ?? null, result.expiry?.label ?? null,
      result.timingStatus ?? 'UNVERIFIED', result.entryWindowSeconds ?? 15,
      result.chartDetection?.isChart ? 1 : 0, result.reasoning ?? null, String(inputSource)
    );
    res.json({ success: true, local: true });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

app.get('/api/signals', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM signals ORDER BY id DESC LIMIT ?').all(Math.min(Number(req.query.limit) || 50, 200));
    const stats = db.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN outcome = 'WIN' THEN 1 ELSE 0 END) AS wins, SUM(CASE WHEN outcome = 'LOSS' THEN 1 ELSE 0 END) AS losses FROM signals WHERE outcome IS NOT NULL").get();
    res.json({ success: true, signals: rows, verifiedStats: stats, local: true });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

app.post('/api/signals/:signalId/outcome', (req, res) => {
  const { outcome } = req.body || {};
  if (!['WIN', 'LOSS', 'DRAW', 'UNKNOWN'].includes(outcome)) return res.status(400).json({ success: false, error: 'outcome must be WIN, LOSS, DRAW or UNKNOWN.' });
  try {
    const info = db.prepare('UPDATE signals SET outcome = ?, outcome_verified_at = ? WHERE signal_id = ?').run(outcome, new Date().toISOString(), req.params.signalId);
    if (info.changes === 0) return res.status(404).json({ success: false, error: 'Signal not found.' });
    const updated = db.prepare('SELECT * FROM signals WHERE signal_id = ?').get(req.params.signalId);
    res.json({ success: true, signal: updated, local: true });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

// ---- Alert log (records which channels actually fired per signal) ----
app.post('/api/alerts', (req, res) => {
  const { signalId, channels } = req.body || {};
  if (!signalId || !Array.isArray(channels)) return res.status(400).json({ success: false, error: 'signalId and channels array are required.' });
  try {
    const insert = db.prepare('INSERT INTO alert_log (created_at, signal_id, channel) VALUES (?, ?, ?)');
    const now = new Date().toISOString();
    for (const channel of channels) insert.run(now, String(signalId), String(channel));
    res.json({ success: true, local: true });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

app.get('/api/alerts', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM alert_log ORDER BY id DESC LIMIT ?').all(Math.min(Number(req.query.limit) || 100, 500));
    res.json({ success: true, alerts: rows, local: true });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

app.get('/api/history', (req, res) => { try { const limit = Math.min(Number(req.query.limit) || 50, 200); res.json({ success: true, history: db.prepare('SELECT * FROM analysis_history ORDER BY id DESC LIMIT ?').all(limit) }); } catch (error: any) { res.status(500).json({ success: false, error: error.message }); } });
app.delete('/api/history/:id', (req, res) => { try { db.prepare('DELETE FROM analysis_history WHERE id = ?').run(req.params.id); res.json({ success: true }); } catch (error: any) { res.status(500).json({ success: false, error: error.message }); } });
app.delete('/api/history', (_req, res) => { try { db.prepare('DELETE FROM analysis_history').run(); res.json({ success: true }); } catch (error: any) { res.status(500).json({ success: false, error: error.message }); } });
app.all('/api/*', (req, res) => res.status(404).json({ success: false, error: `API route not found: ${req.method} ${req.path}` }));
export { app };
const direct = !isVercel && (process.argv[1]?.endsWith('server.ts') || process.env.RUN_STANDALONE === 'true');
if (direct) import('vite').then(({ createServer }) => createServer({ server: { middlewareMode: true }, appType: 'spa' })).then((vite) => { app.use(vite.middlewares); app.listen(PORT, () => console.log(`Local algorithmic terminal active on http://localhost:${PORT}`)); });
