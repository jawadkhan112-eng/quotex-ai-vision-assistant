/**
 * Safe API response handler.
 *
 * ROOT-CAUSE context: Vercel returns PLAIN TEXT for platform-level rejections
 * (e.g. HTTP 413 "Request Entity Too Large"). Calling response.json() on that
 * produced `Unexpected token 'R', "Request En"... is not valid JSON`, hiding
 * the real server error. This module never blindly parses JSON: it inspects
 * status + Content-Type, surfaces the actual body, and reports where the
 * failure happened (upload / processing / response parsing).
 */

export interface SafeFetchResult<T = any> {
  ok: boolean;
  status: number;
  contentType: string;
  responseType: 'JSON' | 'TEXT' | 'HTML' | 'EMPTY' | 'UNKNOWN';
  data: T | null;
  rawText: string;
  /** Human-readable diagnostic; populated when ok is false. */
  error?: string;
  /** Which phase failed, for diagnostics panels. */
  failurePhase?: 'UPLOAD' | 'PROCESSING' | 'RESPONSE_PARSING' | 'NETWORK' | 'SERVER';
}

const textType = (ct: string): SafeFetchResult['responseType'] =>
  ct.includes('application/json') ? 'JSON'
    : ct.includes('text/html') ? 'HTML'
      : ct.startsWith('text/') || ct === '' ? 'TEXT'
        : 'UNKNOWN';

/** Pure parser over an already-consumed body — directly unit-testable. */
export function parseApiResponse(status: number, contentType: string, rawText: string): SafeFetchResult {
  const responseType: SafeFetchResult['responseType'] = rawText.length === 0 ? 'EMPTY' : textType(contentType || '');
  const base = { status, contentType, rawText, responseType, ok: status >= 200 && status < 300 } as const;

  if (responseType === 'JSON') {
    try {
      const data = JSON.parse(rawText);
      if (status >= 400 || data?.success === false) {
        return { ...base, ok: false, data, error: data?.error ?? rawText.slice(0, 300), failurePhase: 'SERVER' };
      }
      return { ...base, data };
    } catch {
      // JSON content-type but unparseable body — show the raw text honestly.
      return { ...base, ok: false, data: null, error: `Server claimed JSON but sent unparseable body: ${rawText.slice(0, 200)}`, failurePhase: 'RESPONSE_PARSING' };
    }
  }
  if (responseType === 'EMPTY') {
    return { ...base, ok: false, data: null, error: `Empty response (HTTP ${status}) — endpoint may have failed silently.`, failurePhase: 'SERVER' };
  }
  if (responseType === 'HTML') {
    const titleMatch = rawText.match(/<title>([^<]*)<\/title>/i);
    const summary = titleMatch?.[1] ?? rawText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
    return { ...base, ok: false, data: null, error: `Server error page (HTTP ${status}): ${summary}`, failurePhase: 'SERVER' };
  }
  // Plain text — the classic Vercel 413 "Request Entity Too Large".
  const cleaned = rawText.trim().slice(0, 300);
  const known: Record<number, string> = {
    413: 'Payload too large for the server (HTTP 413). The frame payload exceeded the platform limit — reduce capture resolution or use compressed encoding.',
    408: 'Request timeout (HTTP 408) — processing took too long. Retry with a smaller frame.',
    429: 'Rate limited (HTTP 429) — too many requests. Slow the frame sampling rate.',
    502: 'Bad gateway (HTTP 502) — serverless function crashed or timed out.',
    504: 'Gateway timeout (HTTP 504) — function exceeded the execution time limit.',
  };
  return {
    ...base,
    ok: false,
    data: null,
    error: known[status] ?? `HTTP ${status}: ${cleaned || 'no body'}`,
    failurePhase: status === 413 ? 'UPLOAD' : 'SERVER',
  };
}

/** Fetch + parse in one step. Network failures are caught and reported. */
export async function safeFetchJson<T = any>(
  url: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<SafeFetchResult<T>> {
  const { timeoutMs = 30000, ...rest } = init ?? {};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(url, { ...rest, signal: controller.signal });
  } catch (e: any) {
    clearTimeout(timer);
    const aborted = e?.name === 'AbortError';
    return {
      ok: false, status: 0, contentType: '', responseType: 'EMPTY', data: null, rawText: '',
      error: aborted ? `Request timed out after ${timeoutMs}ms.` : `Network failure: ${e?.message ?? 'fetch failed'}.`,
      failurePhase: aborted ? 'PROCESSING' : 'NETWORK',
    };
  }
  clearTimeout(timer);
  const contentType = response.headers.get('content-type') ?? '';
  const rawText = await response.text().catch(() => '');
  const result = parseApiResponse(response.status, contentType, rawText);
  return result as SafeFetchResult<T>;
}

/* ------------------- compact frame encoding ------------------- */

/**
 * Convert an analysis canvas to a JPEG blob (quality 0.85) for transport.
 * The server decodes it back to RGBA pixels. A 960×540 chart frame becomes
 * roughly 60–150KB — versus ~15MB as JSON numbers and ~2.7MB as base64 RGBA.
 * JPEG preserves candle body/wick geometry faithfully at chart scales.
 */
export function canvasToJpegBlob(canvas: HTMLCanvasElement, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas JPEG encoding failed.'))),
      'image/jpeg',
      quality
    );
  });
}

/** Size-guard helper: converts bytes to a readable KB/MB string for diagnostics. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Preferred transport: POST the chart frame as raw JPEG bytes to
 * /api/analyze-jpeg. Payload is typically 60–150KB (vs ~2.7MB base64 RGBA or
 * ~15MB JSON numbers), keeping Vercel's HTTP 413 structurally impossible.
 * Falls back to the legacy JSON route ONLY if the JPEG route is unavailable.
 */
export async function analyzeFrameViaJpeg<T = any>(
  canvas: HTMLCanvasElement,
  opts: { symbol?: string; timeframe?: string; quality?: number; timeoutMs?: number } = {}
): Promise<SafeFetchResult<T>> {
  const quality = opts.quality ?? 0.85;
  let blob: Blob;
  try {
    blob = await canvasToJpegBlob(canvas, quality);
  } catch (e: any) {
    return { ok: false, status: 0, contentType: '', responseType: 'EMPTY', data: null, rawText: '', error: e?.message ?? 'JPEG encode failed.', failurePhase: 'UPLOAD' };
  }
  const params = new URLSearchParams({ width: String(canvas.width), height: String(canvas.height) });
  if (opts.symbol) params.set('symbol', opts.symbol);
  if (opts.timeframe) params.set('timeframe', opts.timeframe);
  return safeFetchJson<T>(`/api/analyze-jpeg?${params.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/jpeg' },
    body: blob,
    timeoutMs: opts.timeoutMs ?? 30000,
  });
}
