import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { db } from './server/db.js';
import { analyzeAlgorithmic } from './server/algorithmicEngine.js';

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

app.get('/api/history', (req, res) => { try { const limit = Math.min(Number(req.query.limit) || 50, 200); res.json({ success: true, history: db.prepare('SELECT * FROM analysis_history ORDER BY id DESC LIMIT ?').all(limit) }); } catch (error: any) { res.status(500).json({ success: false, error: error.message }); } });
app.delete('/api/history/:id', (req, res) => { try { db.prepare('DELETE FROM analysis_history WHERE id = ?').run(req.params.id); res.json({ success: true }); } catch (error: any) { res.status(500).json({ success: false, error: error.message }); } });
app.delete('/api/history', (_req, res) => { try { db.prepare('DELETE FROM analysis_history').run(); res.json({ success: true }); } catch (error: any) { res.status(500).json({ success: false, error: error.message }); } });
app.all('/api/*', (req, res) => res.status(404).json({ success: false, error: `API route not found: ${req.method} ${req.path}` }));
export { app };
const direct = !isVercel && (process.argv[1]?.endsWith('server.ts') || process.env.RUN_STANDALONE === 'true');
if (direct) import('vite').then(({ createServer }) => createServer({ server: { middlewareMode: true }, appType: 'spa' })).then((vite) => { app.use(vite.middlewares); app.listen(PORT, () => console.log(`Local algorithmic terminal active on http://localhost:${PORT}`)); });
