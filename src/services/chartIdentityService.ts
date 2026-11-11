/**
 * Chart identity detection service — client-side orchestration.
 *
 * KEY FIX: OCR must run on a HIGH-RESOLUTION crop of the header, not the
 * 320×180 analysis thumbnail. Small header text is unreadable at thumbnail
 * scale, which previously produced UNKNOWN everywhere.
 *
 * Pipeline:
 * 1. Crop the top ~18% of the ORIGINAL-resolution frame.
 * 2. Upscale ×2, grayscale, contrast-stretch, binarize (OCR-friendly).
 * 3. Run Tesseract OCR on the preprocessed crop.
 * 4. Parse pair / market type / timeframe via the deterministic parser.
 */

import { createWorker, type Worker } from 'tesseract.js';
import { parsePairFromText, parseMarketTypeFromText, parseTimeframeFromText, type ChartIdentity } from '../../server/chartIdentity';

let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  workerPromise ??= createWorker('eng');
  return workerPromise;
}

function preprocess(src: CanvasImageSource, sx: number, sy: number, sw: number, sh: number): HTMLCanvasElement {
  const work = document.createElement('canvas');
  const scale = Math.max(2, Math.round(600 / Math.max(sw, 1)));
  work.width = Math.max(sw * scale, 8);
  work.height = Math.max(sh * scale, 8);
  const ctx = work.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, work.width, work.height);
  // Grayscale + contrast stretch + light binarization.
  const img = ctx.getImageData(0, 0, work.width, work.height);
  const d = img.data;
  let min = 255, max = 0;
  const gray = new Uint8ClampedArray(work.width * work.height);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    gray[p] = g;
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const span = Math.max(1, max - min);
  for (let p = 0, i = 0; p < gray.length; p++, i += 4) {
    let v = Math.round(((gray[p] - min) / span) * 255);
    v = v > 150 ? 255 : v < 70 ? 0 : v;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return work;
}

export interface ChartIdentityDetection {
  identity: ChartIdentity;
  ocrText: string;
  /** Data-URL of the exact preprocessed crop used for OCR — shown in diagnostics. */
  headerCropUrl: string | null;
  durationMs: number;
}

/**
 * Detect chart identity from a frame/screenshot canvas.
 * `sourceWidth`/`sourceHeight` refer to the source media dimensions so the
 * header band maps correctly even when the caller's canvas is downscaled.
 */
export async function detectChartIdentity(
  source: HTMLCanvasElement | HTMLVideoElement,
  sourceWidth: number,
  sourceHeight: number
): Promise<ChartIdentityDetection> {
  const started = Date.now();
  let headerCropUrl: string | null = null;
  let text = '';
  try {
    const crop = preprocess(source, 0, 0, sourceWidth, Math.max(1, Math.round(sourceHeight * 0.18)));
    headerCropUrl = crop.toDataURL('image/png');
    const worker = await getWorker();
    const { data } = await worker.recognize(crop);
    text = data.text ?? '';
  } catch (error) {
    text = '';
  }
  const identity: ChartIdentity = {
    pair: parsePairFromText(text),
    timeframe: parseTimeframeFromText(text),
    marketType: parseMarketTypeFromText(text),
    ocrTextLength: text.length,
  };
  return { identity, ocrText: text.trim().slice(0, 500), headerCropUrl, durationMs: Date.now() - started };
}

/** Release OCR resources (call on screen-share stop / unmount). */
export async function disposeOcr(): Promise<void> {
  if (workerPromise) {
    const worker = await workerPromise;
    await worker.terminate();
    workerPromise = null;
  }
}
