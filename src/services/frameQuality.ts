/**
 * Frame quality tracker — client-side freshness and validity monitoring.
 * ==========================================================================
 * Detects fresh / duplicate / frozen / blank frames from the shared-screen
 * stream and drives the honest connection status shown in the UI.
 *
 * Pure TypeScript + tiny canvas pixel sampling; no fabricated data.
 */

export type FrameVerdict = 'FRESH' | 'DUPLICATE' | 'FROZEN' | 'BLANK' | 'INVALID';

export interface FrameCheck {
  verdict: FrameVerdict;
  /** Pixel-level similarity to the previous frame, 0..1 (1 = identical) */
  similarity: number;
  /** Mean luminance 0..255 — near-zero indicates a blank/black frame */
  meanLuminance: number;
  note: string;
}

export interface FrameQualityState {
  lastFrameAt: number | null;
  totalFrames: number;
  acceptedFrames: number;
  duplicateFrames: number;
  frozenFrames: number;
  blankFrames: number;
  /** consecutive duplicate frames — sustained duplicates mean a frozen stream */
  consecutiveDuplicates: number;
  streamFrozen: boolean;
}

export const FROZEN_DUPLICATE_THRESHOLD = 8; // ~4s at 500ms cadence

export function createFrameQualityTracker(maxAgeMs = 5000) {
  let lastSignature: Uint8ClampedArray | null = null;
  const state: FrameQualityState = {
    lastFrameAt: null, totalFrames: 0, acceptedFrames: 0,
    duplicateFrames: 0, frozenFrames: 0, blankFrames: 0,
    consecutiveDuplicates: 0, streamFrozen: false,
  };

  /**
   * Evaluate a captured frame. `signature` is a small downscaled RGBA sample.
   * Latest-frame-wins: each call replaces the stored signature.
   */
  function evaluate(
    signature: Uint8ClampedArray,
    now = Date.now(),
  ): FrameCheck {
    state.totalFrames++;
    const n = signature.length;
    let sum = 0;
    for (let i = 0; i < n; i += 4) sum += signature[i] + signature[i + 1] + signature[i + 2];
    const meanLuminance = n === 0 ? 0 : sum / (n / 4) / 3;

    if (meanLuminance < 4) {
      state.blankFrames++;
      return { verdict: 'BLANK', similarity: lastSignature ? 1 : 0, meanLuminance, note: 'Blank/black frame — shared window may be minimised or hidden.' };
    }

    let similarity = 0;
    if (lastSignature && lastSignature.length === n) {
      let diff = 0;
      for (let i = 0; i < n; i += 4) {
        diff += Math.abs(signature[i] - lastSignature[i]) + Math.abs(signature[i + 1] - lastSignature[i + 1]) + Math.abs(signature[i + 2] - lastSignature[i + 2]);
      }
      similarity = 1 - diff / (n / 4) / 3 / 255;
      similarity = Math.max(0, Math.min(1, similarity));
    }

    lastSignature = signature.slice(); // latest-frame-wins
    state.lastFrameAt = now;

    const duplicate = similarity > 0.995;
    if (duplicate) {
      state.duplicateFrames++;
      state.consecutiveDuplicates++;
      if (state.consecutiveDuplicates >= FROZEN_DUPLICATE_THRESHOLD) {
        state.streamFrozen = true;
        state.frozenFrames++;
        return { verdict: 'FROZEN', similarity, meanLuminance, note: `Stream frozen: ${state.consecutiveDuplicates} consecutive identical frames. The shared window may not be updating.` };
      }
      return { verdict: 'DUPLICATE', similarity, meanLuminance, note: 'Frame identical to previous (static chart — acceptable).' };
    }

    state.consecutiveDuplicates = 0;
    state.streamFrozen = false;
    state.acceptedFrames++;
    return { verdict: 'FRESH', similarity, meanLuminance, note: 'Fresh valid frame.' };
  }

  function isFresh(now = Date.now()): boolean {
    return state.lastFrameAt !== null && now - state.lastFrameAt <= maxAgeMs;
  }

  function reset(): void {
    lastSignature = null;
    state.lastFrameAt = null; state.totalFrames = 0; state.acceptedFrames = 0;
    state.duplicateFrames = 0; state.frozenFrames = 0; state.blankFrames = 0;
    state.consecutiveDuplicates = 0; state.streamFrozen = false;
  }

  function snapshot(): FrameQualityState {
    return { ...state };
  }

  return { evaluate, isFresh, reset, snapshot };
}

export type FrameQualityTracker = ReturnType<typeof createFrameQualityTracker>;
