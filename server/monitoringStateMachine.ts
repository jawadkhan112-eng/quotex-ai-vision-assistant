/**
 * Monitoring states per directive
 */
export type MonitoringState =
  | 'IDLE'
  | 'WAITING_FOR_SCREEN_SHARE'
  | 'INITIALIZING'
  | 'RUNNING'
  | 'ANALYZING'
  | 'PRE_CLOSE_SCAN'
  | 'VERIFYING_CANDLE_CLOSE'
  | 'SIGNAL_CREATED'
  | 'PAUSED'
  | 'STREAM_INTERRUPTED'
  | 'RECOVERING'
  | 'ERROR'
  | 'STOPPED';

/**
 * Configuration for frame sampling
 */
export const FRAME_SAMPLING_CONFIG = {
  normalRatePerSecond: 1,
  preCloseRatePerSecond: 1,
  maxQueueSize: 50,
  latencyWarningThresholdMs: 2000,
};

/**
 * Evidence types from analysis
 */
export type EvidenceType =
  | 'TREND'
  | 'EMA'
  | 'RSI'
  | 'BOLLINGER'
  | 'MACD'
  | 'MOMENTUM'
  | 'CANDLE_PATTERN'
  | 'SUPPORT_RESISTANCE'
  | 'ENGULFING'
  | 'PIN_BAR'
  | 'DOJI'
  | 'INSIDE_BAR'
  | 'BREAKOUT'
  | 'CHART_IDENTITY'
  | 'CANDLE_CLOSE_VERIFICATION';

/**
 * Evidence entry for weighted analysis
 */
export interface EvidenceEntry {
  type: EvidenceType;
  score: number; // contribution to confluence 0-100
  aligned: boolean; // supports the direction or contradicts
  weight: number; // how independent this evidence source is
}

/**
 * Signal direction type
 */
export type SignalDirection = 'CALL' | 'PUT' | 'WAIT';

/**
 * Signal statuses per directive
 */
export type SignalStatus =
  | 'NEW'
  | 'ACTIVE'
  | 'EXPIRED'
  | 'OUTCOME_PENDING'
  | 'WIN_VERIFIED'
  | 'LOSS_VERIFIED'
  | 'INVALIDATED';

/**
 * Adaptive setup classifications
 */
export type SetupClassification = 'HIGH-QUALITY' | 'DEVELOPING' | 'WEAK_OR_CONFLICTING';

/**
 * Signal record with all required fields per directive.
 * Every signal must include these fields when created automatically.
 */
export interface SignalRecord {
  signalId: string;
  monitoringSessionId: string;
  assetPair: string;
  marketType: 'LIVE' | 'OTC' | 'UNKNOWN';
  timeframe: string;
  direction: SignalDirection;
  confluenceScore: number;
  evidenceSummary: string;
  detectedIndicators: string[];
  candleCloseVerification: boolean;
  signalTimestamp: string;
  nextCandleEntryContext: string;
  entryExpiry: string;
  analysisSource: 'AUTOMATIC_LIVE' | 'MANUAL_ANALYZE_NOW';
  frameReference: string;
  algorithmVersion: string;
  dataQuality: 'HIGH' | 'MEDIUM' | 'LOW';
  status: SignalStatus;
  setupClassification: SetupClassification;
}

/**
 * Monitoring state machine - part 1: class declaration and properties
 */
export class MonitoringStateMachine {
  private state: MonitoringState = 'IDLE';
  private frameQueue: Array<{ timestamp: number; frame: any }> = [];
  private lastFrameTime = 0;
  private frameProcessingPromise: Promise<void> | null = null;
  private isProcessing = false;
  private chartIdentity: { pair: string; timeframe: string; marketType: string } | null = null;
  private candleState: { isDeveloping: boolean; startTime: number; lastCloseVerification: 'UNVERIFIED' | 'VERIFIED' | 'FAILED' } = {
    isDeveloping: true,
    startTime: Date.now(),
    lastCloseVerification: 'UNVERIFIED',
  };
  private setupClassification: SetupClassification = 'WEAK_OR_CONFLICTING';
  private confluenceScore = 0;
  private lastSignalTimestamp = 0;
  private consecutiveStaleFrames = 0;
  private maxStaleFrames = 5;
  private listeners: ((state: MonitoringState) => void)[] = [];
  private duplicateSignalBlockedUntil = 0;

  /**
   * Subscribe to state changes
   */
  onStateChange(listener: (state: MonitoringState) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  /**
   * Transition to a new state (controlled, prevents race conditions)
   */
  transitionTo(newState: MonitoringState): boolean {
    if (!this.isValidTransition(this.state, newState)) {
      console.warn(`Invalid state transition from ${this.state} to ${newState}`);
      return false;
    }

    const oldState = this.state;
    this.state = newState;

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(newState);
      } catch (e) {
        // Prevent listener errors from breaking the state machine
      }
    }

    console.log(`Monitoring state: ${oldState} → ${newState}`);
    return true;
  }

  /**
   * Validate state transition
   */
  private isValidTransition(from: MonitoringState, to: MonitoringState): boolean {
    const allowed: Record<MonitoringState, MonitoringState[]> = {
      IDLE: ['WAITING_FOR_SCREEN_SHARE', 'INITIALIZING', 'STOPPED'],
      WAITING_FOR_SCREEN_SHARE: ['INITIALIZING', 'IDLE'],
      INITIALIZING: ['RUNNING', 'IDLE', 'WAITING_FOR_SCREEN_SHARE'],
      RUNNING: ['ANALYZING', 'PAUSED', 'STOPPED', 'STREAM_INTERRUPTED'],
      ANALYZING: ['PRE_CLOSE_SCAN', 'RUNNING', 'PAUSED', 'STOPPED'],
      PRE_CLOSE_SCAN: ['VERIFYING_CANDLE_CLOSE', 'ANALYZING'],
      VERIFYING_CANDLE_CLOSE: ['SIGNAL_CREATED', 'ANALYZING', 'RUNNING'],
      SIGNAL_CREATED: ['RUNNING', 'PAUSED', 'STOPPED'],
      PAUSED: ['RUNNING', 'STOPPED'],
      STREAM_INTERRUPTED: ['STOPPED', 'ERROR', 'RECOVERING', 'RUNNING'],
      RECOVERING: ['RUNNING', 'INITIALIZING', 'ERROR', 'STOPPED'],
      ERROR: ['STOPPED', 'RECOVERING'],
      STOPPED: ['IDLE', 'INITIALIZING'],
    };

    const allowedFrom = allowed[from] || [];
    return allowedFrom.includes(to);
  }

  /**
   * Force transition (bypasses some validation for critical operations)
   */
  forceTransition(newState: MonitoringState): void {
    this.state = newState;
    for (const listener of this.listeners) {
      try {
        listener(newState);
      } catch (e) {}
    }
    console.log(`[FORCE] Monitoring state: ${newState}`);
  }

  /**
   * Get current state
   */
  getState(): MonitoringState {
    return this.state;
  }

  /**
   * Check if monitoring is actively running
   */
  isActive(): boolean {
    return ['RUNNING', 'ANALYZING', 'PRE_CLOSE_SCAN', 'VERIFYING_CANDLE_CLOSE', 'SIGNAL_CREATED'].includes(this.state);
  }

  /**
   * Check if we can process frames (not paused, not errored)
   */
  canProcess(): boolean {
    return this.state === 'RUNNING' || this.state === 'ANALYZING' || this.state === 'PRE_CLOSE_SCAN';
  }

  /**
   * Add frame to processing queue (resource-efficient)
   */
  addFrameToQueue(timestamp: number, frame: any): void {
    if (this.frameQueue.length >= FRAME_SAMPLING_CONFIG.maxQueueSize) {
      this.frameQueue.shift();
      this.consecutiveStaleFrames = Math.max(0, this.consecutiveStaleFrames - 1);
    }
    this.frameQueue.push({ timestamp, frame });
    this.consecutiveStaleFrames = 0;
  }

  /**
   * Mark frame as stale (not added to queue)
   */
  markFrameStale(): void {
    this.consecutiveStaleFrames++;
    if (this.consecutiveStaleFrames >= this.maxStaleFrames) {
      console.warn('Multiple stale frames detected, potentially frozen stream');
    }
  }

  /**
   * Get latest frame from queue (non-destructive peek)
   */
  peekFrame(): { timestamp: number; frame: any } | null {
    if (this.frameQueue.length === 0) return null;
    const frame = this.frameQueue[this.frameQueue.length - 1];
    return frame ?? null;
  }

  /**
   * Pop frame from queue for processing (consumes it)
   */
  popFrameFromQueue(): { timestamp: number; frame: any } | null {
    if (this.frameQueue.length === 0) return null;
    const frame = this.frameQueue.shift();
    return frame ?? null;
  }

  /**
   * Set chart identity (detected from screen)
   */
  setChartIdentity(identity: { pair: string; timeframe: string; marketType: string } | null): void {
    this.chartIdentity = identity;
    if (identity) {
      console.log(`Chart identity updated: ${identity.pair} ${identity.timeframe} ${identity.marketType}`);
    }
  }

  /**
   * Get current chart identity
   */
  getChartIdentity(): { pair: string; timeframe: string; marketType: string } | null {
    return this.chartIdentity;
  }

  /**
   * Update candle state
   */
  updateCandleState(isDeveloping: boolean, closeVerification: 'UNVERIFIED' | 'VERIFIED' | 'FAILED'): void {
    this.candleState = {
      isDeveloping,
      startTime: Date.now(),
      lastCloseVerification: closeVerification,
    };
  }

  /**
   * Get candle state
   */
  getCandleState(): { isDeveloping: boolean; startTime: number; lastCloseVerification: 'UNVERIFIED' | 'VERIFIED' | 'FAILED' } {
    return { ...this.candleState };
  }

  /**
   * Update setup classification and confluence score
   */
  updateSetupClassification(classification: SetupClassification, score: number): void {
    this.setupClassification = classification;
    this.confluenceScore = Math.max(0, Math.min(100, score));
  }

  /**
   * Get current setup classification
   */
  getSetupClassification(): SetupClassification {
    return this.setupClassification;
  }

  /**
   * Get confluence score
   */
  getConfluenceScore(): number {
    return this.confluenceScore;
  }

  /**
   * Check if current candle is still developing (per next-candle rule)
   */
  isCandleDeveloping(): boolean {
    return this.candleState.isDeveloping;
  }

  /**
   * Check if candle close has been verified
   */
  isCandleCloseVerified(): boolean {
    return this.candleState.lastCloseVerification === 'VERIFIED';
  }

  /**
   * Check if we should return WAIT (insufficient evidence)
   */
  shouldWait(): boolean {
    return this.setupClassification === 'WEAK_OR_CONFLICTING' || !this.isCandleCloseVerified();
  }

  /**
   * Record that a signal was just created
   */
  recordSignalCreated(): void {
    this.lastSignalTimestamp = Date.now();
    this.transitionTo('SIGNAL_CREATED');
  }

  /**
   * Get time since last signal (for expiry checking)
   */
  getTimeSinceLastSignal(): number {
    return Date.now() - this.lastSignalTimestamp;
  }

  /**
   * Prevent duplicate signals within time window
   */
  isDuplicateSignalBlocked(): boolean {
    return Date.now() < this.duplicateSignalBlockedUntil;
  }

  /**
   * Block duplicate signal for a window
   */
  blockDuplicateSignal(windowMs: number = 5000): void {
    this.duplicateSignalBlockedUntil = Date.now() + windowMs;
  }

  /**
   * Reset duplicate signal block
   */
  resetDuplicateSignalBlock(): void {
    this.duplicateSignalBlockedUntil = 0;
  }

  /**
   * Add listener for state changes
   */
  addListener(listener: (state: MonitoringState) => void): void {
    this.listeners.push(listener);
  }

  /**
   * Remove listener
   */
  removeListener(listener: (state: MonitoringState) => void): void {
    this.listeners = this.listeners.filter(l => l !== listener);
  }

  /**
   * Get all current state info for diagnostics
   */
  getStateInfo(): {
    state: MonitoringState;
    isActive: boolean;
    canProcess: boolean;
    chartIdentity: { pair: string; timeframe: string; marketType: string } | null;
    candleIsDeveloping: boolean;
    candleCloseVerified: boolean;
    setupClassification: SetupClassification;
    confluenceScore: number;
  } {
    return {
      state: this.state,
      isActive: this.isActive(),
      canProcess: this.canProcess(),
      chartIdentity: this.chartIdentity,
      candleIsDeveloping: this.isCandleDeveloping(),
      candleCloseVerified: this.isCandleCloseVerified(),
      setupClassification: this.setupClassification,
      confluenceScore: this.confluenceScore,
    };
  }
}