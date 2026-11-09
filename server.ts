import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

import { db } from './server/db.js';
import { getActiveAiConfig, saveCustomAiConfig, deleteCustomApiKey } from './server/apiKeyManager.js';
import { analyzeChartImage } from './server/geminiVision.js';
import { analyzeTechnicalIndicators, findSupportResistance, OHLC } from './server/indicators.js';
import { detectCandlestickPatterns } from './server/candlesticks.js';
import { generateFusedSignal } from './server/signalEngine.js';
import { askVoiceAssistant } from './server/voiceAssistant.js';
import { runStrategyBacktest } from './server/backtester.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Set up image upload directory
const isVercel = Boolean(process.env.VERCEL);
const UPLOADS_DIR = isVercel ? '/tmp/uploads' : path.resolve(process.cwd(), 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  try {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  } catch (e) {
    console.warn('Could not create UPLOADS_DIR, using fallback:', e);
  }
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => cb(null, `${Date.now()}_${file.originalname}`),
});
const upload = multer({ storage });

// Helper to generate sample OHLC data for testing
function generateSampleOHLC(symbol: string, timeframe: string, count = 100): OHLC[] {
  const candles: OHLC[] = [];
  let basePrice = symbol.includes('JPY') ? 155.20 : 1.0850;
  const volatility = symbol.includes('JPY') ? 0.08 : 0.0004;
  let now = Date.now() - count * 60 * 1000;

  for (let i = 0; i < count; i++) {
    const open = basePrice;
    const change = (Math.random() - 0.48) * volatility;
    const close = open + change;
    const high = Math.max(open, close) + Math.random() * volatility * 0.5;
    const low = Math.min(open, close) - Math.random() * volatility * 0.5;

    candles.push({
      timestamp: now + i * 60 * 1000,
      open: Number(open.toFixed(5)),
      high: Number(high.toFixed(5)),
      low: Number(low.toFixed(5)),
      close: Number(close.toFixed(5)),
      volume: Math.floor(Math.random() * 500) + 100,
    });
    basePrice = close;
  }
  return candles;
}

// REST API Endpoints

// 1. Health check & Diagnostics
app.get('/api/health', (_req, res) => {
  const aiConfig = getActiveAiConfig();
  const isKeyConfigured = Boolean(aiConfig.apiKey);

  let dbStatus = 'OFFLINE';
  try {
    const row = db.prepare('SELECT count(*) as count FROM user_settings').get() as { count: number };
    if (row) dbStatus = 'ONLINE';
  } catch (err) {
    dbStatus = 'ERROR';
  }

  res.json({
    status: 'OK',
    app: 'Quotex AI Vision Assistant',
    version: '1.0.0',
    geminiKeyConfigured: isKeyConfigured,
    geminiKeyPrefix: aiConfig.maskedKey,
    activeProvider: aiConfig.provider,
    activeModel: aiConfig.model,
    isCustomKey: aiConfig.isCustomKey,
    databaseStatus: dbStatus,
    timestamp: new Date().toISOString(),
  });
});

// 2. GET AI Provider Configuration (Secure - Returns masked key only)
app.get('/api/ai-config', (_req, res) => {
  try {
    const config = getActiveAiConfig();
    res.json({
      success: true,
      provider: config.provider,
      model: config.model,
      maskedKey: config.maskedKey,
      isCustomKey: config.isCustomKey,
      hasKey: Boolean(config.apiKey),
      evidenceThreshold: config.evidenceThreshold,
      supportedModels: [
        { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash (Recommended · Fast Vision)', vision: true },
        { id: 'gemini-4-argon', name: 'Gemini 4 Argon (High Thinking · Complex Analysis)', vision: true },
        { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite (Ultra Fast)', vision: true },
      ],
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Save AI Provider Configuration
app.post('/api/ai-config', (req, res) => {
  try {
    const { apiKey, provider, model, evidenceThreshold } = req.body;
    const updated = saveCustomAiConfig({ apiKey, provider, model, evidenceThreshold });

    res.json({
      success: true,
      message: 'AI Provider configuration updated successfully.',
      provider: updated.provider,
      model: updated.model,
      maskedKey: updated.maskedKey,
      isCustomKey: updated.isCustomKey,
      hasKey: Boolean(updated.apiKey),
      evidenceThreshold: updated.evidenceThreshold,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete custom API key
app.delete('/api/ai-config/key', (_req, res) => {
  try {
    const updated = deleteCustomApiKey();
    res.json({
      success: true,
      message: 'Custom API key removed. Reverted to environment key if available.',
      maskedKey: updated.maskedKey,
      isCustomKey: updated.isCustomKey,
      hasKey: Boolean(updated.apiKey),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Test Gemini Connection
app.post('/api/test-gemini', async (req, res) => {
  const startTime = Date.now();
  try {
    const { apiKeyOverride, modelOverride } = req.body || {};
    const aiConfig = getActiveAiConfig();
    const keyToTest = apiKeyOverride?.trim() || aiConfig.apiKey;
    const modelToTest = modelOverride || aiConfig.model;

    if (!keyToTest) {
      return res.status(400).json({
        success: false,
        message: 'No API key available to test. Please paste a key first.',
      });
    }

    const prompt = 'Test Gemini API connection. Respond with "API Connection Operational".';
    const reply = await askVoiceAssistant(prompt, { testMode: true });
    const latencyMs = Date.now() - startTime;

    if (reply.includes('invalid') || reply.includes('expired') || reply.includes('no AI API key')) {
      return res.status(400).json({
        success: false,
        message: reply,
        latencyMs,
      });
    }

    res.json({
      success: true,
      message: `Gemini API connection validated successfully (${latencyMs}ms)!`,
      activeModel: modelToTest,
      maskedKey: keyToTest.length >= 8 ? `${keyToTest.slice(0, 4)}...${keyToTest.slice(-4)}` : 'SET',
      latencyMs,
      sampleResponse: reply,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || 'Gemini API validation failed.',
    });
  }
});

// 3. Vision Screenshot Analysis
app.post('/api/analyze-vision', upload.single('screenshot'), async (req, res) => {
  try {
    const { symbol = 'EUR/USD (OTC)', timeframe = '1M', base64Image, model } = req.body;

    let imageBuffer: string;
    let mimeType = 'image/png';
    let savedFileName = '';

    if (req.file) {
      savedFileName = req.file.filename;
      const fileData = fs.readFileSync(req.file.path);
      imageBuffer = fileData.toString('base64');
      mimeType = req.file.mimetype || 'image/png';
    } else if (base64Image) {
      imageBuffer = base64Image;
      if (base64Image.startsWith('data:image/jpeg')) mimeType = 'image/jpeg';
      else if (base64Image.startsWith('data:image/webp')) mimeType = 'image/webp';
    } else {
      return res.status(400).json({ error: 'No image provided. Please upload a screenshot or submit base64 data.' });
    }

    const aiConfig = getActiveAiConfig();
    const modelToUse = model || aiConfig.model || 'gemini-3.8-flash';

    // Run Gemini Vision Analysis
    const visionOutput = await analyzeChartImage(imageBuffer, mimeType, symbol, timeframe, modelToUse);

    // Generate sample OHLC context for indicator fusion
    const sampleOHLC = generateSampleOHLC(symbol, timeframe, 60);

    // Run Signal Fusion Engine
    const fusedSignal = generateFusedSignal(sampleOHLC, visionOutput);

    // Save to SQLite
    try {
      const stmt = db.prepare(`
        INSERT INTO analysis_history (
          timestamp, symbol, timeframe, signal, evidence_score, chart_readable,
          trend, momentum, candle_observation, visible_indicators, support_resistance,
          reasons, opposing_evidence, conflicts, invalidation, risk_notes, image_path, model_used
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        new Date().toISOString(),
        symbol,
        timeframe,
        fusedSignal.signal,
        fusedSignal.evidenceQualityScore,
        visionOutput.chartReadable ? 1 : 0,
        visionOutput.trend,
        visionOutput.momentum,
        visionOutput.candleObservation,
        JSON.stringify(visionOutput.visibleIndicators || []),
        visionOutput.supportResistance,
        JSON.stringify(fusedSignal.supportingEvidence),
        JSON.stringify(fusedSignal.opposingEvidence),
        JSON.stringify(visionOutput.conflicts || []),
        visionOutput.invalidation,
        visionOutput.riskNotes,
        savedFileName,
        modelToUse
      );
    } catch (dbErr) {
      console.warn('Could not save history record to DB:', dbErr);
    }

    res.json({
      success: true,
      result: fusedSignal,
      rawVision: visionOutput,
      savedFileName,
    });
  } catch (err: any) {
    console.error('Vision analysis endpoint error:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Vision analysis failed',
    });
  }
});

// 4. Technical Indicator Analysis Endpoint
app.post('/api/analyze-technical', (req, res) => {
  try {
    const { symbol = 'EUR/USD (OTC)', timeframe = '1M', candles } = req.body;

    const ohlcData: OHLC[] = candles && Array.isArray(candles) && candles.length > 0
      ? candles
      : generateSampleOHLC(symbol, timeframe, 100);

    const indicators = analyzeTechnicalIndicators(ohlcData);
    const candlestickPatterns = detectCandlestickPatterns(ohlcData);
    const fusedSignal = generateFusedSignal(ohlcData);

    res.json({
      success: true,
      symbol,
      timeframe,
      candleCount: ohlcData.length,
      lastCandle: ohlcData[ohlcData.length - 1],
      indicators,
      candlestickPatterns,
      fusedSignal,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Ask Voice Assistant
app.post('/api/ask-voice', async (req, res) => {
  try {
    const { query, context } = req.body;
    if (!query) return res.status(400).json({ error: 'Query prompt required' });

    const reply = await askVoiceAssistant(query, context);
    res.json({ success: true, reply });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Backtesting Runner Endpoint
app.post('/api/backtest', (req, res) => {
  try {
    const { symbol = 'EUR/USD (OTC)', timeframe = '1M', expiryCandles = 1, payoutPercentage = 85, evidenceThreshold = 65, candles } = req.body;

    const ohlcData: OHLC[] = candles && Array.isArray(candles) && candles.length > 50
      ? candles
      : generateSampleOHLC(symbol, timeframe, 300);

    const result = runStrategyBacktest(ohlcData, {
      symbol,
      timeframe,
      expiryCandles: Number(expiryCandles),
      payoutPercentage: Number(payoutPercentage),
      evidenceThreshold: Number(evidenceThreshold),
    });

    try {
      const stmt = db.prepare(`
        INSERT INTO backtest_results (
          timestamp, symbol, timeframe, total_candles, total_signals,
          call_count, put_count, wait_count, win_count, loss_count,
          win_rate, profit_factor, expectancy, max_drawdown, config_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        new Date().toISOString(),
        result.symbol,
        result.timeframe,
        result.totalCandles,
        result.totalSignals,
        result.callCount,
        result.putCount,
        result.waitCount,
        result.winCount,
        result.lossCount,
        result.winRate,
        result.profitFactor,
        result.expectancy,
        result.maxDrawdown,
        JSON.stringify({ expiryCandles, payoutPercentage, evidenceThreshold })
      );
    } catch (dbErr) {
      console.warn('Could not save backtest result:', dbErr);
    }

    res.json({ success: true, backtest: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Get Analysis History
app.get('/api/history', (req, res) => {
  try {
    const { limit = 50, symbol, signal } = req.query;

    let query = 'SELECT * FROM analysis_history WHERE 1=1';
    const params: any[] = [];

    if (symbol) {
      query += ' AND symbol = ?';
      params.push(symbol);
    }
    if (signal) {
      query += ' AND signal = ?';
      params.push(signal);
    }

    query += ' ORDER BY id DESC LIMIT ?';
    params.push(Number(limit));

    const rows = db.prepare(query).all(...params);
    res.json({ success: true, count: rows.length, history: rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete history item
app.delete('/api/history/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.prepare('DELETE FROM analysis_history WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Clear all history
app.delete('/api/history', (_req, res) => {
  try {
    db.prepare('DELETE FROM analysis_history').run();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8. Get Sample OHLC
app.get('/api/ohlc-sample', (req, res) => {
  const { symbol = 'EUR/USD (OTC)', timeframe = '1M', count = 100 } = req.query;
  const candles = generateSampleOHLC(String(symbol), String(timeframe), Number(count));
  res.json({ success: true, symbol, timeframe, candles });
});

// 9. User Settings API
app.get('/api/settings', (_req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM user_settings').all() as { key: string; value: string }[];
    const settingsObj: Record<string, string> = {};
    for (const r of rows) {
      // Redact custom_gemini_key
      if (r.key === 'custom_gemini_key') {
        settingsObj['custom_gemini_key'] = r.value ? `${r.value.slice(0, 4)}...${r.value.slice(-4)}` : '';
      } else {
        settingsObj[r.key] = r.value;
      }
    }
    res.json({ success: true, settings: settingsObj });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/settings', (req, res) => {
  try {
    const { settings } = req.body;
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'Invalid settings object' });
    }

    const stmt = db.prepare('INSERT OR REPLACE INTO user_settings (key, value) VALUES (?, ?)');
    const transaction = db.transaction((data: Record<string, string>) => {
      for (const [k, v] of Object.entries(data)) {
        stmt.run(k, String(v));
      }
    });

    transaction(settings);
    res.json({ success: true, message: 'Settings saved' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Export Express App for Vite Integration in Server Mode
export { app };

// Start Standalone / Integrated Server
async function startServer() {
  if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => {
      console.log(`[Quotex AI Vision Assistant] Full-stack application active on http://localhost:${PORT}`);
    });
  }
}

startServer().catch((err) => {
  console.error('Server startup error:', err);
});
