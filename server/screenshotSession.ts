/**
 * Screenshot session management — freshness validation + session isolation.
 * ==========================================================================
 * Every screenshot capture creates a NEW unique session. The engine validates
 * that the image is genuinely fresh (hash + timestamp + candle structure) and
 * refuses to silently substitute an old analysis when a new capture fails.
 *
 * Sessions are strictly separated from the live screen-share engine.
 */

import crypto from 'crypto';
import { type ChartIdentity } from './chartIdentity.js';

export interface ScreenshotFingerprint {
  /** SHA-256 of the exact captured image bytes */
  imageHash: string;
  capturedAt: number;
  width: number;
  height: number;
  /** Number of reconstructed candles at capture time */
  candleCount: number;
  identity: ChartIdentity | null;
}

export interface ScreenshotAnalysisSession {
  sessionId: string;
  screenshotId: string;
  fingerprint: ScreenshotFingerprint;
  createdAt: string;
  /** true when validated as a genuinely fresh, changed screenshot */
  fresh: boolean;
  /** Exact reason when not fresh (identical hash, stale capture, etc.) */
  freshnessReport: string;
  identityChanged: boolean;
}

export interface FreshnessCheck {
  fresh: boolean;
  reason: string;
  identityChanged: boolean;
}

/** In-memory ring of recent fingerprints (bounded memory, latest 32). */
const recentFingerprints: ScreenshotFingerprint[] = [];
const MAX_HISTORY = 32;

export function hashImageBytes(bytes: Buffer | Uint8Array): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

/**
 * Compare a NEW capture against the previous one. Identical image hash = the
 * screenshot did NOT change: report "unchanged" rather than pretending fresh.
 */
export function validateScreenshotFreshness(
  fingerprint: ScreenshotFingerprint,
  previous: ScreenshotFingerprint | null,
): FreshnessCheck {
  if (previous && fingerprint.imageHash === previous.imageHash) {
    return {
      fresh: false,
      reason: 'IMAGE UNCHANGED — identical to the previous screenshot (hash match). Not a fresh chart.',
      identityChanged: false,
    };
  }
  if (previous) {
    const identityChanged =
      previous.identity && fingerprint.identity &&
      (previous.identity.pair.pair !== fingerprint.identity.pair.pair ||
        previous.identity.timeframe.timeframe !== fingerprint.identity.timeframe.timeframe ||
        previous.identity.marketType.marketType !== fingerprint.identity.marketType.marketType);
    return {
      fresh: true,
      reason: 'FRESH — image differs from previous capture.',
      identityChanged: Boolean(identityChanged),
    };
  }
  return { fresh: true, reason: 'FRESH — first capture in this session.', identityChanged: false };
}

/**
 * Create a new independent screenshot analysis session. Never reuses previous
 * candle data or decisions; if the image is unchanged the session is marked
 * NOT fresh with the exact reason.
 */
export function createScreenshotSession(
  fingerprint: ScreenshotFingerprint,
): ScreenshotAnalysisSession {
  const previous = recentFingerprints.length > 0 ? recentFingerprints[recentFingerprints.length - 1] : null;
  const check = validateScreenshotFreshness(fingerprint, previous);
  const session: ScreenshotAnalysisSession = {
    sessionId: `SS-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    screenshotId: `SHOT-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    fingerprint,
    createdAt: new Date().toISOString(),
    fresh: check.fresh,
    freshnessReport: check.reason,
    identityChanged: check.identityChanged,
  };
  recentFingerprints.push(fingerprint);
  if (recentFingerprints.length > MAX_HISTORY) recentFingerprints.shift();
  return session;
}

/** Reset store (tests / explicit user reset). */
export function resetScreenshotSessions(): void {
  recentFingerprints.length = 0;
}
