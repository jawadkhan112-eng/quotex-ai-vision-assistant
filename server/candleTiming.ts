/**
 * Candle timing utilities — pure, deterministic, fully unit-testable.
 *
 * Given a detected timeframe (1M..5M) and the wall clock, computes:
 *  - current candle boundary (start/close)
 *  - close countdown
 *  - pre-close scan window (starts 30s before close)
 *  - next-candle start and expiry (start of next candle + one timeframe)
 *
 * No network calls, no fabrication. If the timeframe is unknown the module
 * reports it rather than inventing one.
 */

export const SUPPORTED_TIMEFRAMES = ['1M', '2M', '3M', '4M', '5M'] as const;
export type SupportedTimeframe = (typeof SUPPORTED_TIMEFRAMES)[number];

export const TIMEFRAME_MS: Record<SupportedTimeframe, number> = {
  '1M': 60_000,
  '2M': 120_000,
  '3M': 180_000,
  '4M': 240_000,
  '5M': 300_000,
};

export function isSupportedTimeframe(tf: string | undefined | null): tf is SupportedTimeframe {
  return typeof tf === 'string' && (SUPPORTED_TIMEFRAMES as readonly string[]).includes(tf.toUpperCase());
}

export interface CandleTiming {
  timeframe: SupportedTimeframe;
  /** Start timestamp (ms) of the candle in progress at `now` */
  candleStart: number;
  /** Close timestamp (ms) of the candle in progress */
  candleClose: number;
  /** Seconds remaining until close */
  secondsToClose: number;
  /** True when now is inside the 30s pre-close scan window */
  preCloseWindow: boolean;
  /** Start of the NEXT candle (the signal target) */
  nextCandleStart: number;
  /** Expiry of the NEXT candle (its close) */
  nextCandleExpiry: number;
}

/** Timeframe boundaries are anchored to Unix epoch so they are stable across sessions. */
export function computeCandleTiming(timeframe: SupportedTimeframe, now = Date.now()): CandleTiming {
  const period = TIMEFRAME_MS[timeframe];
  const candleStart = Math.floor(now / period) * period;
  const candleClose = candleStart + period;
  const secondsToClose = Math.max(0, Math.round((candleClose - now) / 1000));
  return {
    timeframe,
    candleStart,
    candleClose,
    secondsToClose,
    preCloseWindow: secondsToClose <= 30,
    nextCandleStart: candleClose,
    nextCandleExpiry: candleClose + period,
  };
}

/**
 * A frame is STALE when it was captured too long ago relative to the candle it
 * was meant to analyse. Signals from stale frames are marked UNVERIFIED/EXPIRED,
 * never displayed as a valid next-candle signal.
 */
export function isFrameStale(capturedAt: number, now = Date.now(), maxAgeMs = 20_000): boolean {
  return now - capturedAt > maxAgeMs;
}

/**
 * Verify a genuine candle transition: the previous candle genuinely closed when
 * the recorded close timestamp has passed and the observed frame timestamp is
 * newer than it.
 */
export function isCandleTransitionVerified(
  previousCandleClose: number,
  frameCapturedAt: number,
  now = Date.now(),
): boolean {
  return now > previousCandleClose && frameCapturedAt > previousCandleClose;
}

export function formatClock(ms: number): string {
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}
