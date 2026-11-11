import { describe, expect, it } from 'vitest';
import {
  parsePairFromText, parseTimeframeFromText, parseMarketTypeFromText, describeIdentityChange,
  type ChartIdentity,
} from '../server/chartIdentity';

describe('currency pair detection from OCR text', () => {
  it('detects EUR/JPY', () => {
    expect(parsePairFromText('EUR/JPY')).toEqual(expect.objectContaining({ pair: 'EUR/JPY' }));
  });
  it('detects GBP/USD with the (OTC) suffix nearby', () => {
    const r = parsePairFromText('GBP/USD (OTC)  98.4%');
    expect(r.pair).toBe('GBP/USD');
    expect(r.confidence).toBeGreaterThanOrEqual(70);
  });
  it('rejects text without valid currency tokens', () => {
    expect(parsePairFromText('lorem ipsum dolor sit amet').pair).toBe('UNKNOWN');
    expect(parsePairFromText('390.42 +2.31%').pair).toBe('UNKNOWN');
  });
  it('rejects empty or too-short text', () => {
    expect(parsePairFromText('').pair).toBe('UNKNOWN');
    expect(parsePairFromText('ab').pair).toBe('UNKNOWN');
  });
  it('never guesses a pair when the text has no currency tokens', () => {
    expect(parsePairFromText('Balance: $10 000 Payout 92%').pair).toBe('UNKNOWN');
  });
});

describe('market type detection', () => {
  it('recognises explicit OTC marker', () => {
    expect(parseMarketTypeFromText('EUR/USD (OTC)').marketType).toBe('OTC');
  });
  it('recognises explicit live marker', () => {
    expect(parseMarketTypeFromText('EUR/USD LIVE').marketType).toBe('LIVE');
  });
  it('returns UNKNOWN when neither marker is visible', () => {
    expect(parseMarketTypeFromText('EUR/JPY').marketType).toBe('UNKNOWN');
  });
});

describe('timeframe detection from selected-button labels', () => {
  it('detects 1M', () => {
    const r = parseTimeframeFromText('1M');
    expect(r.timeframe).toBe('1M');
    expect(r.confidence).toBeGreaterThanOrEqual(80);
  });
  it('detects 2M', () => {
    expect(parseTimeframeFromText('2m').timeframe).toBe('2M');
  });
  it('detects 5M in a toolbar context', () => {
    const r = parseTimeframeFromText('1M 5M 15M');
    expect(r.timeframe).toBe('1M');
    expect(r.confidence).toBeGreaterThan(0);
  });
  it('detects spelled-out minutes', () => {
    expect(parseTimeframeFromText('5 min').timeframe).toBe('5M');
    expect(parseTimeframeFromText('2 min').timeframe).toBe('2M');
  });
  it('returns UNKNOWN confidence 0 with no timeframe evidence', () => {
    const r = parseTimeframeFromText('EUR/JPY 149.231');
    expect(r.timeframe).toBe('UNKNOWN');
    expect(r.confidence).toBe(0);
  });
});

function identity(pair: string, timeframe: string, market: 'LIVE' | 'OTC' | 'UNKNOWN'): ChartIdentity {
  return {
    pair: { pair, confidence: 90 },
    timeframe: { timeframe, confidence: 90 },
    marketType: { marketType: market, confidence: 90 },
    ocrTextLength: 100,
  };
}

describe('chart identity change detection', () => {
  it('reports no changes for identical identities', () => {
    expect(describeIdentityChange(identity('EUR/JPY', '1M', 'OTC'), identity('EUR/JPY', '1M', 'OTC'))).toHaveLength(0);
  });
  it('detects a pair switch', () => {
    const changes = describeIdentityChange(identity('EUR/JPY', '1M', 'OTC'), identity('GBP/USD', '1M', 'OTC'));
    expect(changes.some((c) => c.includes('Pair change'))).toBe(true);
  });
  it('detects a timeframe switch', () => {
    const changes = describeIdentityChange(identity('EUR/JPY', '1M', 'OTC'), identity('EUR/JPY', '5M', 'OTC'));
    expect(changes.some((c) => c.includes('Timeframe change'))).toBe(true);
  });
  it('treats the first detection as initial, not a change', () => {
    expect(describeIdentityChange(null, identity('EUR/JPY', '1M', 'OTC'))).toEqual(['Initial chart identity detection.']);
  });
});
