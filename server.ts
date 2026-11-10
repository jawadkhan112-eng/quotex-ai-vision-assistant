import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

import { db } from './server/db.js';
import {
  getActiveAiConfig,
  saveCustomAiConfig,
  deleteCustomApiKey,
  listAllProvidersStatus,
  PROVIDER_CATALOG,
} from './server/apiKeyManager.js';
import { analyzeChartImage } from './server/geminiVision.js';
import { generateVisualConfirmationSignal } from './server/signalEngine.js';
import { askVoiceAssistant } from './server/voiceAssistant.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const isVercel = Boolean(process.env.VERCEL);

// Request tracking & Safe Diagnostic Logging
app.use((req: Request, res: Response, next: NextFunction) => {
  const requestId = crypto.randomUUID();
  res.setHeader('X-Request-Id', requestId);
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const sanitizedUrl = req.originalUrl.split('?')[0];
    if (!sanitizedUrl.startsWith('/assets/')) {
      console.log(`[HTTP] ${req.method} ${sanitizedUrl} -> ${res.statusCode} (${duration}ms) [${requestId}]`);
    }
  });

  next();
});

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Set up image upload directory (Vercel uses /tmp)
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
  filename: (_req, file, cb) => cb(null, `${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`),
});
const upload = multer({ storage });

// REST API Endpoints

// 1. Health check & Diagnostics (Screen-Sharing AI Vision Architecture)
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
    version: '2.0.0',
    mode: 'SCREEN_SHARING_AI_VISION_ONLY',
    environment: isVercel ? 'vercel-serverless' : 'standalone-node',
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
    const providers = listAllProvidersStatus();
    const activeProviderDef = PROVIDER_CATALOG.find((p) => p.id === config.provider) || PROVIDER_CATALOG[0];

    res.json({
      success: true,
      provider: config.provider,
      model: config.model,
      maskedKey: config.maskedKey,
      isCustomKey: config.isCustomKey,
      hasKey: Boolean(config.apiKey),
      evidenceThreshold: config.evidenceThreshold,
      supportedModels: activeProviderDef.supportedModels,
      allProviders: providers,
      backupProvider: config.backupProvider,
      backupModel: config.backupModel,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Save AI Provider Configuration
app.post('/api/ai-config', (req, res) => {
  try {
    const { apiKey, provider, model, evidenceThreshold, backupProvider, backupModel } = req.body;
    const updated = saveCustomAiConfig({ apiKey, provider, model, evidenceThreshold, backupProvider, backupModel });

    res.json({
      success: true,
      message: 'AI Provider configuration updated successfully.',
      provider: updated.provider,
      model: updated.model,
      maskedKey: updated.maskedKey,
      isCustomKey: updated.isCustomKey,
      hasKey: Boolean(updated.apiKey),
      evidenceThreshold: updated.evidenceThreshold,
      backupProvider: updated.backupProvider,
      backupModel: updated.backupModel,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete custom API key
app.delete('/api/ai-config/key', (req, res) => {
  try {
    const { provider = 'gemini' } = req.query;
    const updated = deleteCustomApiKey(String(provider));
    res.json({
      success: true,
      message: `Custom API key for ${provider} removed. Reverted to environment key if available.`,
      maskedKey: updated.maskedKey,
      isCustomKey: updated.isCustomKey,
      hasKey: Boolean(updated.apiKey),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Test AI Provider Connection
app.post('/api/test-gemini', async (req, res) => {
  const startTime = Date.now();
  try {
    const { apiKeyOverride, modelOverride, providerOverride } = req.body || {};
    const aiConfig = getActiveAiConfig(providerOverride);
    const providerToTest = providerOverride || aiConfig.provider || 'gemini';
    const keyToTest = apiKeyOverride?.trim() || aiConfig.apiKey;
    const modelToTest = modelOverride || aiConfig.model;

    if (!keyToTest) {
      return res.status(400).json({
        success: false,
        message: `No API key available to test for provider '${providerToTest}'. Please enter a key first.`,
      });
    }

    const prompt = `Test ${providerToTest} API connection. Respond with "API Connection Operational".`;
    const reply = await askVoiceAssistant(prompt, { testMode: true }, providerToTest, keyToTest, modelToTest);
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
      message: `${providerToTest.toUpperCase()} API connection validated successfully (${latencyMs}ms)!`,
      activeProvider: providerToTest,
      activeModel: modelToTest,
      maskedKey: keyToTest.length >= 8 ? `${keyToTest.slice(0, 4)}...${keyToTest.slice(-4)}` : 'SET',
      latencyMs,
      sampleResponse: reply,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || 'AI API validation failed.',
    });
  }
});

// 3. Screen Sharing Frame & Screenshot Vision Analysis
// PURE SCREEN-SHARING / SCREENSHOT PIPELINE:
// USER'S SHARED SCREEN → SCREEN FRAME → AI VISION MODEL → VISUAL CHART ANALYSIS → CONFIRMATION ENGINE → CALL/PUT/WAIT
app.post('/api/analyze-vision', upload.single('screenshot'), async (req, res) => {
  try {
    const { symbol = 'EUR/USD (OTC)', timeframe = '1M', base64Image, model, provider } = req.body;

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
      return res.status(400).json({ success: false, error: 'No chart frame provided. Please share your screen or upload a screenshot.' });
    }

    const aiConfig = getActiveAiConfig(provider);
    const providerToUse = provider || aiConfig.provider;
    const modelToUse = model || aiConfig.model || 'gemini-1.5-flash';

    // 1. Run Pure Vision Analysis on Shared Screen / Screenshot
    const visionOutput = await analyzeChartImage(imageBuffer, mimeType, symbol, timeframe, modelToUse, providerToUse);

    // 2. Run Visual Confirmation Engine (Checklist & next-candle verification)
    const confirmedSignal = generateVisualConfirmationSignal(visionOutput, timeframe, symbol);

    // 3. Save to database history
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
        confirmedSignal.signal,
        confirmedSignal.confidenceScore,
        visionOutput.chartReadable ? 1 : 0,
        visionOutput.trend,
        visionOutput.momentum,
        visionOutput.candleObservation,
        JSON.stringify(visionOutput.visibleIndicators || []),
        visionOutput.supportResistance,
        JSON.stringify(confirmedSignal.supportingEvidence),
        JSON.stringify(confirmedSignal.opposingEvidence),
        JSON.stringify(visionOutput.conflicts || []),
        confirmedSignal.invalidationConditions,
        JSON.stringify(confirmedSignal.riskNotes),
        savedFileName,
        modelToUse
      );
    } catch (dbErr) {
      console.warn('Could not save history record to DB:', dbErr);
    }

    res.json({
      success: true,
      result: confirmedSignal,
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

// 4. Ask Voice Assistant
app.post('/api/ask-voice', async (req, res) => {
  try {
    const { query, context, provider, model } = req.body;
    if (!query) return res.status(400).json({ success: false, error: 'Query prompt required' });

    const reply = await askVoiceAssistant(query, context, provider, undefined, model);
    res.json({ success: true, reply });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Get Analysis History
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

app.delete('/api/history/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.prepare('DELETE FROM analysis_history WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/history', (_req, res) => {
  try {
    db.prepare('DELETE FROM analysis_history').run();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. User Settings API
app.get('/api/settings', (_req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM user_settings').all() as { key: string; value: string }[];
    const settingsObj: Record<string, string> = {};
    for (const r of rows) {
      if (r.key.includes('key')) {
        settingsObj[r.key] = r.value ? `${r.value.slice(0, 4)}...${r.value.slice(-4)}` : '';
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
      return res.status(400).json({ success: false, error: 'Invalid settings object' });
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

// Central 404 handler for unrecognized /api/ routes to guarantee valid JSON
app.all('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: `API route not found: ${req.method} ${req.path}`,
    statusCode: 404,
    timestamp: new Date().toISOString(),
  });
});

// Central JSON Error Handling Middleware for Express
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[API Central Error Handler]', err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    success: false,
    error: err.message || 'Internal Server Error',
    statusCode: status,
    timestamp: new Date().toISOString(),
  });
});

// Export Express App for Vercel Serverless Function & Testing
export { app };

// Start Standalone Server ONLY when executed directly (not when imported as a serverless module)
const isDirectRun = !isVercel && (
  process.argv[1]?.endsWith('server.ts') ||
  process.argv[1]?.endsWith('server.js') ||
  process.env.RUN_STANDALONE === 'true'
);

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
      console.log(`[Quotex AI Vision Assistant] Screen-Sharing AI Vision server active on http://localhost:${PORT}`);
    });
  }
}

if (isDirectRun) {
  startServer().catch((err) => {
    console.error('Server startup error:', err);
  });
}
