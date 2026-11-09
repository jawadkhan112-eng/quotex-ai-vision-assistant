import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import { GoogleGenAI } from '@google/genai';
import { db } from './server/db.js';
import { getActiveAiConfig, saveCustomAiConfig, deleteCustomApiKey } from './server/apiKeyManager.js';
import { analyzeChartImage } from './server/geminiVision.js';
import { analyzeTechnicalIndicators, type OHLC } from './server/indicators.js';
import { detectCandlestickPatterns } from './server/candlesticks.js';
import { generateFusedSignal } from './server/signalEngine.js';
import { askVoiceAssistant } from './server/voiceAssistant.js';
import { runStrategyBacktest } from './server/backtester.js';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_CANDLES = 5000;
app.use(cors());
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true, limit: '12mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    const allowed = ['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype);
    callback(allowed ? null : new Error('Unsupported image type. Use PNG, JPEG, or WEBP.'), allowed);
  },
});

/** Validate provided OHLC data; never synthesize prices to fill missing market data. */
export function validateCandles(value: unknown, minCount = 1): OHLC[] | null {
  if (!Array.isArray(value) || value.length < minCount || value.length > MAX_CANDLES) return null;
  const candles: OHLC[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const c = item as Record<string, unknown>;
    if (!(typeof c.timestamp === 'string' || (typeof c.timestamp === 'number' && Number.isFinite(c.timestamp)))) return null;
    if (![c.open, c.high, c.low, c.close].every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
    const open = c.open as number, high = c.high as number, low = c.low as number, close = c.close as number;
    if (high < low || high < Math.max(open, close) || low > Math.min(open, close)) return null;
    if (c.volume !== undefined && (typeof c.volume !== 'number' || !Number.isFinite(c.volume) || c.volume < 0)) return null;
    candles.push({ timestamp: c.timestamp as string | number, open, high, low, close,
      ...(c.volume === undefined ? {} : { volume: c.volume as number }) });
  }
  return candles;
}

function reportError(res: express.Response, error: unknown, fallback: string) {
  res.status(500).json({ success: false, error: error instanceof Error ? error.message : fallback });
}

app.get('/api/health', (_req, res) => {
  const config = getActiveAiConfig();
  let databaseStatus = 'OFFLINE';
  try { db.prepare('SELECT count(*) FROM user_settings').get(); databaseStatus = 'ONLINE'; } catch { databaseStatus = 'ERROR'; }
  res.json({ status: 'OK', app: 'Quotex AI Vision Assistant', version: '1.0.0',
    geminiKeyConfigured: Boolean(config.apiKey), geminiKeyPrefix: config.maskedKey,
    activeProvider: config.provider, activeModel: config.model, isCustomKey: config.isCustomKey,
    databaseStatus, timestamp: new Date().toISOString() });
});

app.get('/api/ai-config', (_req, res) => {
  try {
    const c = getActiveAiConfig();
    res.json({ success: true, provider: c.provider, model: c.model, maskedKey: c.maskedKey,
      isCustomKey: c.isCustomKey, hasKey: Boolean(c.apiKey), evidenceThreshold: c.evidenceThreshold,
      supportedModels: [{ id: c.model, name: c.model, vision: true }] });
  } catch (e) { reportError(res, e, 'Could not load AI configuration'); }
});

app.post('/api/ai-config', (req, res) => {
  try {
    const { apiKey, provider, model, evidenceThreshold } = req.body ?? {};
    if (apiKey !== undefined && typeof apiKey !== 'string') return res.status(400).json({ success: false, error: 'API key must be text.' });
    if (provider !== undefined && provider !== 'gemini') return res.status(400).json({ success: false, error: 'Only Gemini is implemented.' });
    if (model !== undefined && (typeof model !== 'string' || !model.trim())) return res.status(400).json({ success: false, error: 'Invalid model.' });
    if (evidenceThreshold !== undefined && (!Number.isInteger(evidenceThreshold) || evidenceThreshold < 50 || evidenceThreshold > 90)) return res.status(400).json({ success: false, error: 'Threshold must be an integer from 50 to 90.' });
    const c = saveCustomAiConfig({ apiKey, provider, model, evidenceThreshold });
    res.json({ success: true, provider: c.provider, model: c.model, maskedKey: c.maskedKey,
      isCustomKey: c.isCustomKey, hasKey: Boolean(c.apiKey), evidenceThreshold: c.evidenceThreshold });
  } catch (e) { reportError(res, e, 'Could not save AI configuration'); }
});

app.delete('/api/ai-config/key', (_req, res) => {
  try {
    const c = deleteCustomApiKey();
    res.json({ success: true, maskedKey: c.maskedKey, isCustomKey: c.isCustomKey, hasKey: Boolean(c.apiKey) });
  } catch (e) { reportError(res, e, 'Could not remove custom API key'); }
});

// Validate the exact candidate key/model entered in settings, without persisting it.
app.post('/api/test-gemini', async (req, res) => {
  const start = Date.now();
  try {
    const saved = getActiveAiConfig();
    const key = typeof req.body?.apiKeyOverride === 'string' && req.body.apiKeyOverride.trim() ? req.body.apiKeyOverride.trim() : saved.apiKey;
    const model = typeof req.body?.modelOverride === 'string' && req.body.modelOverride.trim() ? req.body.modelOverride.trim() : saved.model;
    if (!key) return res.status(400).json({ success: false, message: 'No API key available to test.' });
    const client = new GoogleGenAI({ apiKey: key });
    const response = await client.models.generateContent({ model, contents: 'Reply exactly: API connection operational.' });
    const latencyMs = Date.now() - start;
    res.json({ success: true, message: `Gemini API connection validated (${latencyMs}ms).`, activeModel: model,
      maskedKey: key.length >= 8 ? `${key.slice(0, 4)}...${key.slice(-4)}` : 'SET', latencyMs, sampleResponse: response.text || '' });
  } catch (e) {
    res.status(400).json({ success: false, message: e instanceof Error ? e.message : 'Gemini API validation failed.', latencyMs: Date.now() - start });
  }
});

app.post('/api/analyze-vision', upload.single('screenshot'), async (req, res) => {
  try {
    const { symbol = 'Unknown', timeframe = 'Unknown', base64Image, model, candles: rawCandles } = req.body ?? {};
    let image: string;
    let mimeType = 'image/png';
    if (req.file) { image = req.file.buffer.toString('base64'); mimeType = req.file.mimetype; }
    else if (typeof base64Image === 'string' && base64Image.length) {
      const match = base64Image.match(/^data:(image\/(?:png|jpeg|webp));base64,/);
      if (base64Image.startsWith('data:') && !match) return res.status(400).json({ success: false, error: 'Image must be PNG, JPEG, or WEBP.' });
      if (match) mimeType = match[1];
      image = base64Image.replace(/^data:image\/(?:png|jpeg|webp);base64,/, '');
      if (image.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3)) return res.status(413).json({ success: false, error: 'Image exceeds 8 MB.' });
    } else return res.status(400).json({ success: false, error: 'No image provided.' });

    let candles: OHLC[] | null = null;
    if (rawCandles !== undefined) {
      let value: unknown = rawCandles;
      if (typeof rawCandles === 'string') { try { value = JSON.parse(rawCandles); } catch { return res.status(400).json({ success: false, error: 'Invalid OHLC JSON.' }); } }
      candles = validateCandles(value, 14);
      if (!candles) return res.status(400).json({ success: false, error: 'Provide at least 14 valid OHLC candles.' });
    }
    const config = getActiveAiConfig();
    const modelUsed = typeof model === 'string' && model.trim() ? model.trim() : config.model;
    const vision = await analyzeChartImage(image, mimeType, String(symbol), String(timeframe), modelUsed);
    const signal = generateFusedSignal(candles ?? undefined, vision);
    try {
      db.prepare(`INSERT INTO analysis_history (timestamp, symbol, timeframe, signal, evidence_score, chart_readable,
        trend, momentum, candle_observation, visible_indicators, support_resistance, reasons, opposing_evidence,
        conflicts, invalidation, risk_notes, image_path, model_used) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(new Date().toISOString(), String(symbol), String(timeframe), signal.signal, signal.evidenceQualityScore,
          vision.chartReadable ? 1 : 0, vision.trend, vision.momentum, vision.candleObservation,
          JSON.stringify(vision.visibleIndicators || []), vision.supportResistance, JSON.stringify(signal.supportingEvidence),
          JSON.stringify(signal.opposingEvidence), JSON.stringify(vision.conflicts || []), vision.invalidation, vision.riskNotes, '', modelUsed);
    } catch (e) { console.warn('History persistence unavailable:', e instanceof Error ? e.message : 'database error'); }
    res.json({ success: true, result: signal, rawVision: vision,
      dataSource: candles ? 'User-supplied OHLC plus screenshot vision' : 'Screenshot vision only; no OHLC supplied' });
  } catch (e) { console.error('Vision analysis failed:', e instanceof Error ? e.message : 'unknown error'); reportError(res, e, 'Vision analysis failed'); }
});

app.post('/api/analyze-technical', (req, res) => {
  try {
    const { symbol = 'Unknown', timeframe = 'Unknown' } = req.body ?? {};
    const candles = validateCandles(req.body?.candles, 14);
    if (!candles) return res.status(400).json({ success: false, code: 'OHLC_DATA_REQUIRED', error: 'Provide at least 14 valid OHLC candles; synthetic data is disabled.' });
    res.json({ success: true, symbol, timeframe, candleCount: candles.length, dataSource: 'User-supplied OHLC',
      lastCandle: candles[candles.length - 1], indicators: analyzeTechnicalIndicators(candles),
      candlestickPatterns: detectCandlestickPatterns(candles), fusedSignal: generateFusedSignal(candles) });
  } catch (e) { reportError(res, e, 'Technical analysis failed'); }
});

app.post('/api/ask-voice', async (req, res) => {
  try {
    const { query, context } = req.body ?? {};
    if (typeof query !== 'string' || !query.trim()) return res.status(400).json({ success: false, error: 'Query prompt required.' });
    if (query.length > 4000) return res.status(400).json({ success: false, error: 'Query exceeds 4,000 characters.' });
    res.json({ success: true, reply: await askVoiceAssistant(query, context) });
  } catch (e) { reportError(res, e, 'Assistant request failed'); }
});

app.post('/api/backtest', (req, res) => {
  try {
    const { symbol = 'Unknown', timeframe = 'Unknown', expiryCandles = 1, payoutPercentage = 85, evidenceThreshold = 65 } = req.body ?? {};
    const candles = validateCandles(req.body?.candles, 51);
    if (!candles) return res.status(400).json({ success: false, code: 'HISTORICAL_OHLC_REQUIRED', error: 'Provide at least 51 valid historical OHLC candles; synthetic backtest data is disabled.' });
    if (!Number.isInteger(Number(expiryCandles)) || Number(expiryCandles) < 1 || Number(expiryCandles) > 100) return res.status(400).json({ success: false, error: 'Expiry must be 1–100 candles.' });
    if (!Number.isFinite(Number(payoutPercentage)) || Number(payoutPercentage) <= 0 || Number(payoutPercentage) > 100) return res.status(400).json({ success: false, error: 'Payout must be >0 and <=100.' });
    if (!Number.isFinite(Number(evidenceThreshold)) || Number(evidenceThreshold) < 0 || Number(evidenceThreshold) > 100) return res.status(400).json({ success: false, error: 'Evidence threshold must be 0–100.' });
    const result = runStrategyBacktest(candles, { symbol: String(symbol), timeframe: String(timeframe), expiryCandles: Number(expiryCandles), payoutPercentage: Number(payoutPercentage), evidenceThreshold: Number(evidenceThreshold) });
    try {
      db.prepare(`INSERT INTO backtest_results (timestamp, symbol, timeframe, total_candles, total_signals, call_count,
        put_count, wait_count, win_count, loss_count, win_rate, profit_factor, expectancy, max_drawdown, config_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(new Date().toISOString(), result.symbol, result.timeframe, result.totalCandles, result.totalSignals,
          result.callCount, result.putCount, result.waitCount, result.winCount, result.lossCount, result.winRate,
          result.profitFactor, result.expectancy, result.maxDrawdown,
          JSON.stringify({ expiryCandles, payoutPercentage, evidenceThreshold, dataSource: 'User-supplied historical OHLC' }));
    } catch (e) { console.warn('Backtest persistence unavailable:', e instanceof Error ? e.message : 'database error'); }
    res.json({ success: true, dataSource: 'User-supplied historical OHLC', backtest: result });
  } catch (e) { reportError(res, e, 'Backtest failed'); }
});

app.get('/api/history', (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const { symbol, signal } = req.query;
    let sql = 'SELECT * FROM analysis_history WHERE 1=1';
    const params: (string | number)[] = [];
    if (typeof symbol === 'string' && symbol) { sql += ' AND symbol = ?'; params.push(symbol); }
    if (typeof signal === 'string' && ['CALL', 'PUT', 'WAIT'].includes(signal)) { sql += ' AND signal = ?'; params.push(signal); }
    sql += ' ORDER BY id DESC LIMIT ?'; params.push(limit);
    const history = db.prepare(sql).all(...params);
    res.json({ success: true, count: history.length, history });
  } catch (e) { reportError(res, e, 'Could not load history'); }
});
app.delete('/api/history/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ success: false, error: 'Invalid history ID.' });
  try { const result = db.prepare('DELETE FROM analysis_history WHERE id = ?').run(id); res.json({ success: true, deleted: result.changes }); }
  catch (e) { reportError(res, e, 'Could not delete history record'); }
});
app.delete('/api/history', (_req, res) => {
  try { db.prepare('DELETE FROM analysis_history').run(); res.json({ success: true }); }
  catch (e) { reportError(res, e, 'Could not clear history'); }
});

// Retire the endpoint which previously returned fabricated sample prices.
app.get('/api/ohlc-sample', (_req, res) => res.status(410).json({ success: false,
  code: 'SYNTHETIC_DATA_DISABLED', error: 'Synthetic OHLC data is disabled. Supply real OHLC from a verified data source.' }));

app.get('/api/settings', (_req, res) => {
  try {
    const rows = db.prepare('SELECT key, value FROM user_settings').all() as { key: string; value: string }[];
    const settings: Record<string, string> = {};
    for (const row of rows) settings[row.key] = row.key === 'custom_gemini_key' ? getActiveAiConfig().maskedKey : row.value;
    res.json({ success: true, settings });
  } catch (e) { reportError(res, e, 'Could not load settings'); }
});
app.post('/api/settings', (req, res) => {
  try {
    const settings = req.body?.settings;
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return res.status(400).json({ success: false, error: 'Invalid settings object.' });
    const allowed = new Set(['default_symbol', 'default_timeframe', 'auto_save_screenshots', 'evidence_threshold', 'theme']);
    const entries = Object.entries(settings).filter(([key, value]) => allowed.has(key) && ['string', 'number', 'boolean'].includes(typeof value));
    const statement = db.prepare('INSERT OR REPLACE INTO user_settings (key, value) VALUES (?, ?)');
    db.transaction(() => { for (const [key, value] of entries) statement.run(key, String(value)); })();
    res.json({ success: true, message: 'Settings saved' });
  } catch (e) { reportError(res, e, 'Could not save settings'); }
});

export { app };
async function startServer() {
  if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  }
  if (process.env.NODE_ENV !== 'test') app.listen(PORT, () => console.log(`[Quotex AI Vision Assistant] Active on http://localhost:${PORT}`));
}
startServer().catch((error) => console.error('Server startup error:', error));
