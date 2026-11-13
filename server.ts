import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { db } from './server/db.js';
import { analyzeAlgorithmic, reportSignalOutcome, resetMtgState } from './server/algorithmicEngine.js';
import { analyzeProviderCandles, PROVIDER_ENGINE_VERSION, type ProviderCandle } from './server/modules/signalProviderIntelligence.js';
import { analyzeUnified, UNIFIED_ENGINE_VERSION, type UnifiedDecision } from './server/unifiedDecisionEngine.js';
import { createScreenshotSession, hashImageBytes, resetScreenshotSessions, type ScreenshotAnalysisSession } from './server/screenshotSession.js';
import { reportOutcome, lossGate, snapshotLossState, resetLossManagement, getLossConfig, configureLossManagement } from './server/lossManagement.js';
import { recordOutcome, performanceReport, MIN_SAMPLE_SIZE } from './server/outcomeLearning.js';
import { computeCandleTiming, isSupportedTimeframe } from './server/candleTiming.js';
import jpegDecode from 'jpeg-js';

dotenv.config();
const app = express(); const PORT = process.env.PORT || 3000; const isVercel = Boolean(process.env.VERCEL);
app.use((req: Request, res: Response, next: NextFunction) => { const id = crypto.randomUUID(); res.setHeader('X-Request-Id', id); next(); });
app.use(cors()); app.use(express.json({ limit: '8mb' }));

app.get('/api/health', (_req, res) => res.json({ status: 'OK', app: 'Quotex Algorithmic Trading Terminal', version: '3.0.0', mode: 'LOCAL_ALGORITHMIC_ANALYSIS', environment: isVercel ? 'vercel-serverless' : 'standalone-node', externalApiCalls: false, timestamp: new Date().toISOString() }));

/**
 * Decode a compact base64 RGBA frame (client encoding keeps payloads under the
 * ~4.5MB Vercel request limit) into the {width,height,pixels:number[]} shape
 * the analysis engine expects. Legacy JSON number-array frames still accepted.
 */
function decodeFrame(raw: any): { width: number; height: number; pixels: number[] } | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const width = Number(raw.width), height = Number(raw.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return undefined;
  if (typeof raw.pixelsBase64 === 'string' && raw.pixelsBase64.length > 0) {
    const buf = Buffer.from(raw.pixelsBase64, 'base64');
    const expected = width * height * 4;
    if (buf.length < expected) return undefined;
    return { width, height, pixels: Array.from(buf.subarray(0, expected)) };
  }
  if (Array.isArray(raw.pixels)) return { width, height, pixels: raw.pixels };
  return undefined;
}

app.post('/api/analyze-algorithmic', (req, res) => {
  const { prices, candles, timeframe = '1M' } = req.body || {};
  const frame = decodeFrame(req.body?.frame);
  if ((!Array.isArray(prices) || prices.length < 2) && !frame) return res.status(400).json({ success: false, error: 'Provide at least two finite closing prices or a chart frame.' });
  try {
    const result = analyzeAlgorithmic({ prices: Array.isArray(prices) ? prices : [], candles: Array.isArray(candles) ? candles : undefined, timeframe, frame });
    try { db.prepare('INSERT INTO analysis_history (timestamp, symbol, timeframe, signal, evidence_score, chart_readable, candle_observation, reasons) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(result.analysisTimestamp, req.body.symbol || 'Local chart', timeframe, result.signal, result.confidenceScore, 1, result.candleObservation, JSON.stringify([result.reasoning])); } catch { /* history is optional */ }
    res.json({ success: true, result, local: true });
  } catch (error: any) { res.status(400).json({ success: false, error: error.message || 'Algorithmic analysis failed.' }); }
});

/**
 * JPEG frame analysis route — the production transport for chart frames.
 *
 * Why: base64 RGBA (≈2.7MB for 960×540) still trips some Vercel route limits;
 * JSON number arrays (~15MB) are far worse. A JPEG-encoded chart frame is
 * typically 60–150KB, keeping HTTP 413 structurally impossible while
 * preserving full candle geometry. The client POSTs raw image/jpeg bytes;
 * jpeg-js decodes server-side into the exact RGBA shape the engine expects.
 * Query params: ?width=&height= (analysis raster dimensions declared by client).
 */
app.post('/api/analyze-jpeg', express.raw({ type: 'image/jpeg', limit: '2mb' }), (req, res) => {
  const width = Number(req.query.width), height = Number(req.query.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 8 || height < 8) {
    return res.status(400).json({ success: false, error: 'Provide valid ?width= and ?height= query parameters.' });
  }
  if (!req.body || !Buffer.isBuffer(req.body) || req.body.length < 100) {
    return res.status(400).json({ success: false, error: 'Expected a raw image/jpeg request body.' });
  }
  try {
    const decoded = jpegDecode.decode(req.body, { useTArray: true, maxMemoryUsageInMB: 64 });
    if (decoded.width !== width || decoded.height !== height) {
      return res.status(400).json({ success: false, error: `Declared dimensions ${width}x${height} do not match JPEG ${decoded.width}x${decoded.height}.` });
    }
    const frame = { width: decoded.width, height: decoded.height, pixels: Array.from(decoded.data) };
    const result = analyzeAlgorithmic({ timeframe: String(req.query.timeframe || '1M'), frame });
    try { db.prepare('INSERT INTO analysis_history (timestamp, symbol, timeframe, signal, evidence_score, chart_readable, candle_observation, reasons) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(result.analysisTimestamp, String(req.query.symbol || 'Local chart'), String(req.query.timeframe || '1M'), result.signal, result.confidenceScore, 1, result.candleObservation, JSON.stringify([result.reasoning])); } catch { /* history is optional */ }
    res.json({ success: true, result, local: true });
  } catch (error: any) { res.status(400).json({ success: false, error: error.message || 'JPEG frame analysis failed.' }); }
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
  // Dedup includes SOURCE so a screenshot decision can never collide with or
  // overwrite the live engine's decision for the same asset+timeframe+candle.
  const dedupKey = `${meta.source ?? 'LIVE'}|${meta.asset}|${meta.marketType}|${meta.timeframe}|${meta.targetCandle ?? 'unknown'}|${decision.analysisVersion ?? PROVIDER_ENGINE_VERSION}`;
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

/**
 * UNIFIED DECISION ENGINE — the ONE authoritative decision per target candle.
 *
 * Both source pipelines (LIVE screen-share and SCREENSHOT) call this endpoint
 * with their own candles + source tag. It runs the SPI engine AND the legacy
 * algorithmic engine, folds their evidence with correlation control, applies
 * the loss-management gate (which can only ADD a WAIT, never change direction),
 * and returns one consistent decision: mainSignal === prediction, always.
 */
app.post('/api/unified-decision', (req, res) => {
  const { completed, developing, window, asset = 'UNKNOWN', marketType = 'UNKNOWN', timeframe = 'UNKNOWN', source = 'LIVE', targetCandle, capturedAt } = req.body || {};
  if (!Array.isArray(completed) || completed.length < 3) {
    return res.status(400).json({ success: false, error: 'Provide at least 3 completed candles (open/high/low/close objects).' });
  }
  const validCompleted = (completed as ProviderCandle[]).filter((c) =>
    c && Number.isFinite(c.open) && Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close));
  if (validCompleted.length < 3) return res.status(400).json({ success: false, error: 'Completed candles must contain finite open/high/low/close.' });
  try {
    // Run both engines on the SAME candle input — deterministic, reproducible.
    const provider = analyzeProviderCandles({ completed: validCompleted, developing, window: window === 10 ? 10 : 5 });
    const legacy = analyzeAlgorithmic({
      prices: validCompleted.map((c) => c.close),
      candles: validCompleted.map((c) => ({ open: c.open, high: c.high, low: c.low, close: c.close })),
      timeframe,
    });
    const indicatorsAvailable = validCompleted.length >= 15; // RSI/Bollinger actually computable
    let decision: UnifiedDecision = analyzeUnified({
      provider, legacy: { signal: legacy.signal, confidenceScore: legacy.confidenceScore, trendFilter: legacy.trendFilter },
      completed: validCompleted, developing, indicatorsAvailable,
      marketType, timeframe,
    });

    // Loss gate: a previous loss can only ADD a WAIT (cooldown/suspension) —
    // it never flips direction and never lowers/raises confidence.
    const gate = lossGate();
    if (gate.blocked && decision.mainSignal !== 'WAIT') {
      decision = {
        ...decision,
        mainSignal: 'WAIT', prediction: 'WAIT', qualified: false,
        waitReason: `${gate.reason} Chart-evidence direction was ${decision.mainSignal}, withheld by risk management (direction unchanged).`,
      };
    }

    // Candle timing for the target candle (only for supported timeframes).
    const timing = isSupportedTimeframe(timeframe)
      ? computeCandleTiming(timeframe, capturedAt ? Number(capturedAt) : Date.now())
      : null;

    // Persist the unified decision with the exact target-candle timestamp so the
    // dedup key (source|asset|market|tf|targetCandle|version) enforces one decision
    // per verified completed candle.
    const target = timing ? String(timing.nextCandleStart) : String(targetCandle ?? 'unknown');
    const decisionId = `DEC-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const dedupKey = `${source}|${asset}|${marketType}|${timeframe}|${target}|${UNIFIED_ENGINE_VERSION}`;
    try {
      db.prepare(`INSERT INTO candle_decisions (decision_id, created_at, asset, market_type, timeframe, target_candle, prediction, prediction_confidence, confluence_score, classification, qualified, explanation, wait_reason, data_quality, candles_analyzed, source, outcome, analysis_version, dedup_key)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`)
        .run(decisionId, new Date().toISOString(), asset, marketType, timeframe, target,
          decision.prediction, decision.predictionConfidence, decision.confluence, decision.classification,
          decision.qualified ? 1 : 0, decision.supportingEvidence.map((e) => `[${e.family}] ${e.note}`).join(' | '),
          decision.waitReason ?? null, decision.dataQuality, decision.candlesAnalyzed, source,
          UNIFIED_ENGINE_VERSION, dedupKey);
    } catch (persistError: any) {
      // UNIQUE violation = duplicate decision for the same target candle — not an error.
      if (!String(persistError.message).includes('UNIQUE')) throw persistError;
    }
    (decision as UnifiedDecision & { decisionId?: string }).decisionId = decisionId;

    res.json({
      success: true,
      decision,
      timing,
      meta: {
        asset, marketType, timeframe, source,
        targetCandle: timing ? timing.nextCandleStart : (targetCandle ?? null),
        expiry: timing ? timing.nextCandleExpiry : null,
        analysisVersion: UNIFIED_ENGINE_VERSION,
      },
    });
  } catch (error: any) { res.status(400).json({ success: false, error: error.message || 'Unified decision failed.' }); }
});

/**
 * Screenshot session endpoint: registers a freshly captured screenshot, checks
 * freshness against the previous capture (hash + timestamp), and returns a NEW
 * unique session. A capture identical to the previous one is reported as
 * UNCHANGED, never analysed as if fresh.
 */
app.post('/api/screenshot-session', express.raw({ type: 'image/jpeg', limit: '2mb' }), (req, res) => {
  try {
    if (!req.body || !Buffer.isBuffer(req.body) || req.body.length < 100) {
      return res.status(400).json({ success: false, error: 'Expected a raw image/jpeg body.' });
    }
    const width = Number(req.query.width), height = Number(req.query.height);
    const candleCount = Number(req.query.candles ?? 0);
    const identity = req.query.identity ? JSON.parse(String(req.query.identity)) : null;
    const session: ScreenshotAnalysisSession = createScreenshotSession({
      imageHash: hashImageBytes(req.body),
      capturedAt: Date.now(),
      width: Number.isFinite(width) ? width : 0,
      height: Number.isFinite(height) ? height : 0,
      candleCount: Number.isFinite(candleCount) ? candleCount : 0,
      identity,
    });
    res.json({ success: true, session });
  } catch (error: any) { res.status(400).json({ success: false, error: error.message || 'Screenshot session failed.' }); }
});
app.post('/api/screenshot-session/reset', (_req, res) => { resetScreenshotSessions(); res.json({ success: true }); });

// ---- Loss management: WIN/LOSS reporting, cooldown, limits ----
app.post('/api/loss-management/outcome', (req, res) => {
  const { outcome, direction } = req.body || {};
  if (outcome !== 'WIN' && outcome !== 'LOSS') return res.status(400).json({ success: false, error: "outcome must be 'WIN' or 'LOSS'." });
  const state = reportOutcome({ outcome, direction: String(direction ?? 'UNKNOWN') });
  res.json({ success: true, state, config: getLossConfig(), local: true });
});
app.get('/api/loss-management', (_req, res) => res.json({ success: true, state: snapshotLossState(), config: getLossConfig(), gate: lossGate(), local: true }));
app.post('/api/loss-management/reset', (_req, res) => { resetLossManagement(); res.json({ success: true, state: snapshotLossState(), local: true }); });
app.post('/api/loss-management/config', (req, res) => {
  const { cooldownAfterLosses, cooldownDurationMs, maxTotalLosses } = req.body || {};
  configureLossManagement({
    cooldownAfterLosses: Number.isFinite(Number(cooldownAfterLosses)) ? Math.max(1, Number(cooldownAfterLosses)) : undefined,
    cooldownDurationMs: Number.isFinite(Number(cooldownDurationMs)) ? Math.max(0, Number(cooldownDurationMs)) : undefined,
    maxTotalLosses: Number.isFinite(Number(maxTotalLosses)) ? Math.max(1, Number(maxTotalLosses)) : undefined,
  });
  res.json({ success: true, config: getLossConfig(), local: true });
});

// ---- Verified-outcome learning: record decision outcomes, report performance ----
app.post('/api/outcomes', (req, res) => {
  const { decisionId, source, asset, marketType, timeframe, prediction, confluence, topStrategyFamilies, marketCondition, targetCandle, outcome, observedMove } = req.body || {};
  if (!decisionId || !['WIN', 'LOSS', 'EXPIRED', 'INVALID'].includes(outcome)) {
    return res.status(400).json({ success: false, error: 'decisionId and outcome (WIN|LOSS|EXPIRED|INVALID) are required.' });
  }
  recordOutcome({
    decisionId: String(decisionId),
    source: source === 'SCREENSHOT' ? 'SCREENSHOT' : 'LIVE',
    asset: String(asset ?? 'UNKNOWN'), marketType: String(marketType ?? 'UNKNOWN'),
    timeframe: String(timeframe ?? 'UNKNOWN'),
    prediction: prediction === 'UP' ? 'UP' : prediction === 'DOWN' ? 'DOWN' : 'WAIT',
    confluence: Math.max(0, Math.min(100, Number(confluence) || 0)),
    topStrategyFamilies: Array.isArray(topStrategyFamilies) ? topStrategyFamilies.map(String) : [],
    marketCondition: marketCondition === 'TRENDING' ? 'TRENDING' : 'RANGING',
    targetCandle: String(targetCandle ?? 'unknown'),
    outcome, observedMove: Number.isFinite(Number(observedMove)) ? Number(observedMove) : undefined,
    recordedAt: new Date().toISOString(),
  });
  res.json({ success: true, local: true });
});
app.get('/api/outcomes/performance', (_req, res) => res.json({ success: true, performance: performanceReport(), minSampleSize: MIN_SAMPLE_SIZE, local: true }));

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
