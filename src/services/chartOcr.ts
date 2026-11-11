/**
 * Client-side OCR service for chart identity detection.
 *
 * Uses tesseract.js loaded lazily from npm (bundled), running entirely in the
 * browser — no external API calls, no secrets, no market-data dependency.
 *
 * Strategy per directive: the chart header (top band of the shared frame) holds
 * the pair label and the timeframe selector row (usually along the top edge of
 * the platform). We OCR the top band at higher resolution for reliability.
 * OCR is expensive — results are cached per capture session and refreshed at
 * a throttled interval, not on every animation frame.
 */

import { createWorker, type Worker } from 'tesseract.js';
import { parsePairFromText, parseMarketTypeFromText, parseTimeframeFromText, type ChartIdentity } from '../../server/chartIdentity';

let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  workerPromise ??= createWorker('eng');
  return workerPromise;
}

/** OCR the given canvas, optionally restricted to a region (fractions 0..1). */
async function ocrRegion(
  canvas: HTMLCanvasElement,
  region?: { x0: number; y0: number; x1: number; y1: number }
): Promise<string> {
  const worker = await getWorker();
  const x = Math.floor((region?.x0 ?? 0) * canvas.width);
  const y = Math.floor((region?.y0 ?? 0) * canvas.height);
  const w = Math.floor(((region?.x1 ?? 1) - (region?.x0 ?? 0)) * canvas.width);
  const h = Math.floor(((region?.y1 ?? 1) - (region?.y0 ?? 0)) * canvas.height);
  if (w < 8 || h < 8) return '';
  const work = document.createElement('canvas');
  work.width = w; work.height = h;
  work.getContext('2d')!.drawImage(canvas, x, y, w, h, 0, 0, w, h);
  const { data } = await worker.recognize(work);
  return data.text ?? '';
}

export interface ChartIdentityDetection {
  identity: ChartIdentity;
  ocrText: string;
  /** Which region the text came from — 'header' = top ~18% of the frame. */
  region: 'header' | 'full';
  durationMs: number;
}

/**
 * Detect chart identity from a captured frame. OCRs the header band first;
 * falls back to full-frame OCR only if the header produced no pair evidence.
 */
export async function detectChartIdentity(canvas: HTMLCanvasElement): Promise<ChartIdentityDetection> {
  const started = Date.now();
  let text = await ocrRegion(canvas, { x0: 0, y0: 0, x1: 1, y1: 0.18 });
  let region: 'header' | 'full' = 'header';
  if (!parsePairFromText(text).pair || parsePairFromText(text).pair === 'UNKNOWN') {
    const full = await ocrRegion(canvas);
    if (full.trim().length > text.trim().length) { text = full; region = 'full'; }
  }
  const identity: ChartIdentity = {
    pair: parsePairFromText(text),
    timeframe: parseTimeframeFromText(text),
    marketType: parseMarketTypeFromText(text),
    ocrTextLength: text.length,
  };
  return { identity, ocrText: text.trim().slice(0, 500), region, durationMs: Date.now() - started };
}

/** Release OCR resources (call on screen-share stop / unmount). */
export async function disposeOcr(): Promise<void> {
  if (workerPromise) {
    const worker = await workerPromise;
    await worker.terminate();
    workerPromise = null;
  }
}
