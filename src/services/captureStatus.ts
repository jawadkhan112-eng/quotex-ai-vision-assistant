/**
 * Capture connection state machine — honest frame freshness states.
 * ==========================================================================
 * Separates "the MediaStream exists" (CONNECTED) from "a genuinely new frame
 * arrived" (FRESH). Never lets an active-but-silent stream masquerade as live.
 *
 * States:
 *  CONNECTED   — capture stream active, waiting for first/next valid frame
 *  FRESH       — a new valid frame has arrived within the threshold
 *  PROCESSING  — the latest frame is currently being analyzed
 *  STALE       — no new valid frame within the freshness threshold
 *  DISCONNECTED— stream ended or permission revoked
 *  RECOVERING  — user restarted sharing; validating incoming frames
 */

import type { FrameQualityTracker } from './frameQuality';

export type CaptureState =
  | 'CONNECTED' | 'FRESH' | 'PROCESSING' | 'STALE' | 'DISCONNECTED' | 'RECOVERING';

export interface CaptureStatusSnapshot {
  state: CaptureState;
  lastFrameAt: number | null;
  lastAnalysisAt: number | null;
  frameAgeMs: number;
  trackReadyState: string;
  trackMuted: boolean;
  trackLabel: string;
  visibilityState: string;
  frozen: boolean;
}

export interface CaptureStatusOptions {
  /** true when navigator.mediaDevices.getDisplayMedia stream object exists and track is live */
  streamActive: boolean;
  /** video element currently delivering decodable frames */
  videoReady: boolean;
  tracker: FrameQualityTracker | null;
  processing: boolean;
  /** true once a frame has arrived after a STALE/DISCONNECTED period */
  recovering?: boolean;
  visibilityState?: string;
  /** ms since last valid frame; null = none ever */
  frameAgeMs: number | null;
}

/** Default freshness threshold: screen charts change slowly; 5s covers a
 * paused-but-healthy stream without crying STALE on a static chart. */
export const FRESHNESS_THRESHOLD_MS = 5000;

export function resolveCaptureState(o: CaptureStatusOptions): CaptureState {
  const { streamActive, videoReady, tracker, processing, recovering, frameAgeMs } = o;
  if (!streamActive) return 'DISCONNECTED';
  if (recovering && frameAgeMs !== null && frameAgeMs <= FRESHNESS_THRESHOLD_MS) return 'RECOVERING';
  if (frameAgeMs === null) return 'CONNECTED'; // stream live, no frame evaluated yet
  if (processing) return 'PROCESSING';
  if (frameAgeMs > FRESHNESS_THRESHOLD_MS) return 'STALE';
  // Frame age within threshold AND tracker confirms validity:
  if (tracker && tracker.snapshot().streamFrozen) return 'STALE';
  return videoReady ? 'FRESH' : 'STALE';
}

export function captureStatusSnapshot(
  o: CaptureStatusOptions & {
    lastFrameAt: number | null; lastAnalysisAt: number | null;
    track: MediaStreamTrack | null; now: number;
  },
): CaptureStatusSnapshot {
  return {
    state: resolveCaptureState(o),
    lastFrameAt: o.lastFrameAt,
    lastAnalysisAt: o.lastAnalysisAt,
    frameAgeMs: o.frameAgeMs ?? -1,
    trackReadyState: o.track?.readyState ?? 'none',
    trackMuted: o.track?.muted ?? false,
    trackLabel: o.track?.label ?? '',
    visibilityState: o.visibilityState ?? document.visibilityState,
    frozen: o.tracker?.snapshot().streamFrozen ?? false,
  };
}
