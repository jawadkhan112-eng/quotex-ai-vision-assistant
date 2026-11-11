/**
 * Visual candle reconstruction engine — pure TypeScript / pixel processing.
 *
 * Identifies candlestick structures inside a captured chart frame using column
 * scans and contiguous-region analysis, then estimates OHLC values from chart
 * geometry. All values are ESTIMATES derived from pixels — never invented.
 *
 * No network calls. No fabricated data. If a valid chart cannot be confidently
 * reconstructed, the module returns fewer/no candles and callers must treat
 * indicator history as unavailable rather than fabricating values.
 */

export interface PixelFrame {
  width: number;
  height: number;
  pixels: number[]; // RGBA, length = width * height * 4
}

export interface ReconstructedCandle {
  /** Column x-range of the candle in frame pixels */
  xStart: number;
  xEnd: number;
  /** Estimated relative y coordinates (0 = top of plotting region, 1 = bottom) */
  topY: number; // high position (lowest y of candle incl. wick)
  bodyTopY: number;
  bodyBottomY: number;
  bottomY: number; // low position (highest y)
  /** Estimated relative OHLC (0..1 price scale within the chart plotting region) */
  open: number;
  high: number;
  low: number;
  close: number;
  bullish: boolean;
  bodyRange: number;
  upperWick: number;
  lowerWick: number;
  /** 0..100 reconstruction quality score */
  quality: number;
  qualityStatus: 'GOOD' | 'FAIR' | 'POOR';
}

export interface CandleReconstructionResult {
  candles: ReconstructedCandle[];
  /** Detected chart plotting region */
  region: { x0: number; y0: number; x1: number; y1: number } | null;
  /** Price-axis-derived estimate: pixels per price unit cannot be known absolutely,
   * so values are relative (0..1 of plot height). Quality reflects estimation reliability. */
  quality: 'GOOD' | 'FAIR' | 'POOR';
  averageCandleConfidence: number;
  notes: string[];
}

const isGreenish = (r: number, g: number, b: number) => g > r * 1.1 && g > b * 1.1;
const isReddish = (r: number, g: number, b: number) => r > g * 1.1 && r > b * 1.1;
const isSignificant = (r: number, g: number, b: number) => Math.max(r, g, b) > 60;

/**
 * Reconstructs visible candles from a captured frame.
 *
 * Approach:
 * 1. Classify each pixel as candle (green/red) or background.
 * 2. Group contiguous candle-coloured columns into candidate candles.
 * 3. For each candidate, separate body columns (wide) from wick columns (narrow)
 *    using per-column vertical run lengths.
 * 4. Estimate high/low from the widest vertical extent; open/close from body
 *    edges of the bullish/bearish direction determined by column colour.
 */
export function reconstructCandles(frame: PixelFrame): CandleReconstructionResult {
  const notes: string[] = [];
  if (!frame || !Array.isArray(frame.pixels) || frame.pixels.length < frame.width * frame.height * 4) {
    return { candles: [], region: null, quality: 'POOR', averageCandleConfidence: 0, notes: ['Invalid or incomplete frame data.'] };
  }
  const { width, height, pixels } = frame;

  // Plotting region detection: candle pixels bounding box.
  let minX = width, maxX = 0, minY = height, maxY = 0;
  let candlePixelCount = 0;
  const colInfo: Array<{ hasCandle: boolean; green: number; red: number; top: number; bottom: number; runMax: number }> = [];
  for (let x = 0; x < width; x++) {
    let green = 0, red = 0, top = height, bottom = 0, run = 0, runMax = 0;
    for (let y = 0; y < height; y++) {
      const i = (y * width + x) * 4;
      const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
      if (isSignificant(r, g, b) && (isGreenish(r, g, b) || isReddish(r, g, b))) {
        candlePixelCount++;
        if (isGreenish(r, g, b)) green++; else red++;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        run++;
        if (run > runMax) runMax = run;
      } else run = 0;
    }
    colInfo.push({ hasCandle: green + red > 0, green, red, top, bottom, runMax });
    if (green + red > 0) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (top < minY) minY = top;
      if (bottom > maxY) maxY = bottom;
    }
  }

  if (candlePixelCount < 30) {
    return { candles: [], region: null, quality: 'POOR', averageCandleConfidence: 0, notes: ['Too few candle-coloured pixels for reconstruction.'] };
  }

  const region = { x0: minX, y0: minY, x1: maxX, y1: maxY };
  const regionHeight = Math.max(maxY - minY, 1);

  // Group contiguous candle columns into candidates (allow small gaps for wick/axis lines).
  const gapTolerance = Math.max(1, Math.round(width * 0.004));
  const groups: Array<{ xStart: number; xEnd: number }> = [];
  let current: { xStart: number; xEnd: number } | null = null;
  let gap = 0;
  for (let x = minX; x <= maxX; x++) {
    if (colInfo[x].hasCandle) {
      if (!current) current = { xStart: x, xEnd: x };
      else { current.xEnd = x; gap = 0; }
    } else if (current) {
      gap++;
      if (gap > gapTolerance) {
        groups.push(current);
        current = null;
        gap = 0;
      }
    }
  }
  if (current) groups.push(current);

  // Very wide groups = likely multiple candles merged (closely spaced). Split by
  // detecting internal color-transition valleys when group is much wider than median width.
  const widths = groups.map((g) => g.xEnd - g.xStart + 1).sort((a, b) => a - b);
  const medianWidth = widths[Math.floor(widths.length / 2)] || 1;
  const expandedGroups: Array<{ xStart: number; xEnd: number }> = [];
  for (const g of groups) {
    const w = g.xEnd - g.xStart + 1;
    if (w > medianWidth * 3 && w > 6) {
      // Split into approximate equal segments matching median width.
      const n = Math.max(2, Math.round(w / medianWidth));
      const seg = Math.floor(w / n);
      for (let s = 0; s < n; s++) {
        expandedGroups.push({ xStart: g.xStart + s * seg, xEnd: s === n - 1 ? g.xEnd : g.xStart + s * seg + seg - 1 });
      }
    } else expandedGroups.push(g);
  }

  // Convert each group into a candle estimate.
  const candles: ReconstructedCandle[] = [];
  for (const g of expandedGroups) {
    const cols: number[] = [];
    for (let x = g.xStart; x <= g.xEnd; x++) cols.push(x);
    const colWidth = cols.length;

    // Per-column top/bottom extents.
    const extents = cols.map((x) => colInfo[x]);
    const top = Math.min(...extents.map((e) => e.top));
    const bottom = Math.max(...extents.filter((e) => e.bottom >= e.top).map((e) => e.bottom));
    if (bottom <= top) continue;

    // Body columns: those with vertical run ≈ full column extent (thick part).
    const runMaxes = extents.map((e) => e.runMax);
    const maxRun = Math.max(...runMaxes);
    const bodyThreshold = Math.max(2, maxRun * 0.6);
    const bodyCols = cols.filter((_, idx) => runMaxes[idx] >= bodyThreshold);
    // Wick columns: narrow columns with smaller runs.
    const wickCols = cols.filter((_, idx) => runMaxes[idx] < bodyThreshold);

    // Colour dominance within group determines bullish/bearish.
    const greens = extents.reduce((a, e) => a + e.green, 0);
    const reds = extents.reduce((a, e) => a + e.red, 0);
    const bullish = greens >= reds;

    let bodyTop = top, bodyBottom = bottom;
    if (bodyCols.length > 0 && wickCols.length > 0) {
      const bodyColExtents = bodyCols.map((x) => colInfo[x]);
      bodyTop = Math.min(...bodyColExtents.map((e) => e.top));
      bodyBottom = Math.max(...bodyColExtents.filter((e) => e.bottom >= e.top).map((e) => e.bottom));
    } else if (bodyCols.length === 0) {
      // No wide columns — doji/complete wick candle: body ≈ thin.
      bodyTop = top;
      bodyBottom = bottom;
    }

    const rel = (y: number) => (y - minY) / regionHeight; // 0 top, 1 bottom
    const high = rel(top);
    const low = rel(bottom);
    const bodyTopRel = rel(bodyTop);
    const bodyBottomRel = rel(bodyBottom);

    // OHLC estimation (relative units, where 1 = highest visible price, 0 = lowest).
    // Higher y pixel = lower price. So price-ish value = 1 - rel.
    const p = (relY: number) => 1 - relY;
    let open: number, close: number;
    if (bullish) { open = p(bodyBottomRel); close = p(bodyTopRel); }
    else { open = p(bodyTopRel); close = p(bodyBottomRel); }
    const highP = p(high);
    const lowP = p(low);

    // Body height must not exceed candle range.
    const upperWick = highP - Math.max(open, close);
    const lowerWick = Math.min(open, close) - lowP;
    const bodySize = Math.abs(close - open);
    const candleRange = Math.max(highP - lowP, 1e-6);

    // Quality: fraction of body columns detected, sane geometry, reasonable width.
    const bodyFraction = bodyCols.length / Math.max(colWidth, 1);
    let quality = 40
      + (bodyFraction >= 0.5 ? 30 : bodyFraction * 60)
      + (colWidth >= 2 ? 15 : 0)
      + (bodySize + upperWick + lowerWick >= 0.9 * candleRange ? 15 : 0);
    quality = Math.min(100, Math.round(quality));

    candles.push({
      xStart: g.xStart, xEnd: g.xEnd,
      topY: rel(top), bodyTopY: bodyTopRel, bodyBottomY: bodyBottomRel, bottomY: rel(bottom),
      open: Number(open.toFixed(6)), high: Number(highP.toFixed(6)), low: Number(lowP.toFixed(6)), close: Number(close.toFixed(6)),
      bullish,
      bodyRange: Number(bodySize.toFixed(6)),
      upperWick: Number(upperWick.toFixed(6)),
      lowerWick: Number(lowerWick.toFixed(6)),
      quality,
      qualityStatus: quality >= 75 && candleRange >= 0.02 ? 'GOOD' : quality >= 50 ? 'FAIR' : 'POOR',
    });
}

const avg = candles.length ? Math.round(candles.reduce((a, c) => a + c.quality, 0) / candles.length) : 0;
const overall: CandleReconstructionResult['quality'] = candles.length < 5 ? 'POOR' : avg >= 70 ? 'GOOD' : avg >= 50 ? 'FAIR' : 'POOR';
if (expandedGroups.length !== groups.length) notes.push('Merged candle groups split heuristically; spacing uneven.');
if (candles.length < 8) notes.push('Few visible candles — historical indicators (RSI/Bollinger) may be unavailable.');

return { candles, region, quality: overall, averageCandleConfidence: avg, notes };
}
