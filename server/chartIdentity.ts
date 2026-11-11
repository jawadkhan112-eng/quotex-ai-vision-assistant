/**
 * Chart identity parsing — pure text-based interpretation of OCR output.
 *
 * This module contains NO OCR itself: it deterministically parses whatever text
 * an OCR pass produced from the chart header. Fully unit-testable.
 *
 * Design rules (per directive):
 * - UNKNOWN over guessing. If a pair/timeframe/market type cannot be read with
 *   sufficient confidence, UNKNOWN is returned — never the previous value.
 * - A pair label in the corner of the chart header is the primary pair evidence.
 * - Market type (LIVE/OTC) is only reported when explicitly visible (e.g. "(OTC)").
 * - Timeframe from a selected-button label is primary; spacing alone is not proof.
 */

export interface DetectedPair {
  pair: string; // 'EUR/JPY' or 'UNKNOWN'
  confidence: number; // 0-100
}

export interface DetectedTimeframe {
  timeframe: string; // '1M' | '2M' | '5M' | ... or 'UNKNOWN'
  confidence: number;
}

export interface DetectedMarketType {
  marketType: 'LIVE' | 'OTC' | 'UNKNOWN';
  confidence: number;
}

export interface ChartIdentity {
  pair: DetectedPair;
  timeframe: DetectedTimeframe;
  marketType: DetectedMarketType;
  ocrTextLength: number;
}

const CURRENCIES = 'AED|AUD|BDT|BRL|BTC|CAD|CHF|CNY|DKK|DOGE|EGP|ETH|EUR|GBP|HKD|HRK|HUF|IDR|ILS|INR|JPY|KRW|KWD|LTC|MXN|MYR|NGN|NOK|NZD|PHP|PKR|PLN|RON|SAR|SEK|THB|TRY|TWD|USD|XAU|XAG|ZAR';

const PAIR_RE = new RegExp(`\\b(${CURRENCIES})\\s*[/\\\\|-]?\\s*(${CURRENCIES})\\b`, 'i');
const OTC_RE = /\botc\b/i;
const LIVE_RE = /\b(live|real[- ]?time|real\b)/i;

const TIMEFRAME_RE = /\b(1\s*m(?:in)?|2\s*m(?:in)?|5\s*m(?:in)?|15\s*m(?:in)?|30\s*s(?:ec)?|30\s*m(?:in)?|1\s*h(?:r|our)?|4\s*h(?:r|our)?|s5|m1|m5|m15|h1)\b/i;

/** Parses a currency pair from raw OCR text. Returns UNKNOWN when nothing reliable is found. */
export function parsePairFromText(text: string): DetectedPair {
  if (!text || text.trim().length < 3) return { pair: 'UNKNOWN', confidence: 0 };
  const match = text.match(PAIR_RE);
  if (!match) return { pair: 'UNKNOWN', confidence: 0 };
  const base = match[1].toUpperCase();
  const quote = match[2].toUpperCase();
  if (base === quote) return { pair: 'UNKNOWN', confidence: 0 };
  // Confidence scaled by how clean the match looks: separator required for high confidence.
  const hasSep = /[/\\|-]/.test(match[0]);
  const cleanContext = /\s/.test(text.slice(0, match.index ?? 0).slice(-2)) || (match.index ?? 0) === 0;
  const confidence = Math.min(98, 60 + (hasSep ? 25 : 0) + (cleanContext ? 10 : 0));
  return { pair: `${base}/${quote}`, confidence };
}

/** Parses an explicit OTC / LIVE marker from OCR text. Absent marker → UNKNOWN. */
export function parseMarketTypeFromText(text: string): DetectedMarketType {
  if (!text || text.trim().length < 3) return { marketType: 'UNKNOWN', confidence: 0 };
  if (OTC_RE.test(text)) return { marketType: 'OTC', confidence: 90 };
  if (LIVE_RE.test(text)) return { marketType: 'LIVE', confidence: 65 };
  return { marketType: 'UNKNOWN', confidence: 0 };
}

/** Parses a selected-timeframe label from OCR text. Absent/ambiguous → UNKNOWN. */
export function parseTimeframeFromText(text: string): DetectedTimeframe {
  if (!text || text.trim().length < 2) return { timeframe: 'UNKNOWN', confidence: 0 };
  const match = text.match(TIMEFRAME_RE);
  if (!match) return { timeframe: 'UNKNOWN', confidence: parserFallback() };
  const raw = match[1].replace(/\s+/g, '').toUpperCase();
  const canonical = raw === '1MIN' ? '1M' : raw === '2MIN' ? '2M' : raw === '5MIN' ? '5M' : raw === '15MIN' ? '15M' : raw === '30MIN' ? '30M' : raw === '1HR' || raw === '1HOUR' ? '1H' : raw === '4HR' || raw === '4HOUR' ? '4H' : raw === '30SEC' ? '30S' : raw;
  // More confidence when the label is short (a lone "1M" button) than in a sentence.
  const shortLabel = match[0].trim().length <= 4;
  const confidence = Math.min(95, 55 + (shortLabel ? 30 : 0));
  return { timeframe: canonical, confidence };
}

function parserFallback(): number {
  // Context-free ambiguity penalty — spacing-based guesses are not allowed as proof.
  return 0;
}

/**
 * Compare two identities and describe the change (pair/timeframe/market change detection).
 */
export function describeIdentityChange(a: ChartIdentity | null, b: ChartIdentity): string[] {
  if (!a) return ['Initial chart identity detection.'];
  const changes: string[] = [];
  if (a.pair.pair !== b.pair.pair) changes.push(`Pair change: ${a.pair.pair} → ${b.pair.pair}`);
  if (a.timeframe.timeframe !== b.timeframe.timeframe) changes.push(`Timeframe change: ${a.timeframe.timeframe} → ${b.timeframe.timeframe}`);
  if (a.marketType.marketType !== b.marketType.marketType) changes.push(`Market type change: ${a.marketType.marketType} → ${b.marketType.marketType}`);
  return changes;
}
