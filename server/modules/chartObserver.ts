/**
 * Chart Observer - detects and tracks chart identity changes from the shared screen.
 * Consumes OCR text produced by the shared identity service and maps it onto the
 * monitoring state machine.
 */
import { MonitoringStateMachine } from '../monitoringStateMachine.js';
import { parsePairFromText, parseMarketTypeFromText, parseTimeframeFromText, describeIdentityChange } from '../chartIdentity.js';

export interface DetectedChartIdentity {
  pair: string;
  timeframe: string;
  marketType: 'LIVE' | 'OTC' | 'UNKNOWN';
  confidence: number;
  ocrText: string;
  frameTimestamp: number;
}

export interface ChartRegion { x: number; y: number; width: number; height: number; }

export interface ChartChangeResult {
  chartChanged: boolean;
  oldIdentity: DetectedChartIdentity | null;
  newIdentity: DetectedChartIdentity;
  regionChanged: boolean;
  significantChanges: string[];
}

export class ChartObserver {
  private stateMachine: MonitoringStateMachine;
  private lastIdentity: DetectedChartIdentity | null = null;
  private lastRegion: ChartRegion | null = null;
  private ocrStaleCounter = 0;
  private maxStaleOCR = 3;

  constructor(stateMachine: MonitoringStateMachine) {
    this.stateMachine = stateMachine;
  }

  /**
   * Detect chart identity from OCR text.
   */
  detectFromOCR(ocrText: string): { identity: DetectedChartIdentity; changed: boolean } {
    const pairInfo = parsePairFromText(ocrText);
    const marketTypeInfo = parseMarketTypeFromText(ocrText);
    const timeframeInfo = parseTimeframeFromText(ocrText);

    const newIdentity: DetectedChartIdentity = {
      pair: pairInfo.pair,
      timeframe: timeframeInfo.timeframe,
      marketType: marketTypeInfo.marketType,
      confidence: this.calculateConfidence(pairInfo, marketTypeInfo, timeframeInfo),
      ocrText,
      frameTimestamp: Date.now(),
    };

    const changed = this.isIdentityChanged(newIdentity);

    if (changed && newIdentity.pair !== 'UNKNOWN' && newIdentity.timeframe !== 'UNKNOWN') {
      this.stateMachine.setChartIdentity({
        pair: newIdentity.pair,
        timeframe: newIdentity.timeframe,
        marketType: newIdentity.marketType,
      });
      this.lastIdentity = newIdentity;
      this.ocrStaleCounter = 0;
    } else if (newIdentity.pair === 'UNKNOWN' || newIdentity.timeframe === 'UNKNOWN') {
      this.ocrStaleCounter++;
    } else {
      this.lastIdentity = newIdentity;
      this.ocrStaleCounter = 0;
    }

    return { identity: newIdentity, changed };
  }

  /**
   * Check if identity changed from last detection.
   */
  private isIdentityChanged(newIdentity: DetectedChartIdentity): boolean {
    if (!this.lastIdentity) {
      return true;
    }

    const describeChanges: string[] = describeIdentityChange(
      {
        pair: this.lastIdentity.pair,
        timeframe: this.lastIdentity.timeframe,
        marketType: this.lastIdentity.marketType,
      } as any,
      { ...newIdentity, ocrTextLength: newIdentity.ocrText.length } as any
    );

    return describeChanges.length > 0;
  }

  /**
   * Calculate confidence score.
   */
  private calculateConfidence(
    pairInfo: { pair: string; confidence: number },
    marketTypeInfo: { marketType: 'LIVE' | 'OTC' | 'UNKNOWN'; confidence: number },
    timeframeInfo: { timeframe: string; confidence: number }
  ): number {
    let confidence = 50;
    confidence += pairInfo.confidence;
    if (pairInfo.pair !== 'UNKNOWN') {
      confidence += 20;
    }
    confidence += marketTypeInfo.confidence;
    if (marketTypeInfo.marketType !== 'UNKNOWN') {
      confidence += 15;
    }
    confidence += timeframeInfo.confidence;
    if (timeframeInfo.timeframe !== 'UNKNOWN') {
      confidence += 15;
    }
    return Math.min(98, Math.max(0, confidence));
  }

  /**
   * Get last detected identity.
   */
  getLastIdentity(): DetectedChartIdentity | null {
    return this.lastIdentity;
  }

  /**
   * Get last detected region.
   */
  getLastRegion(): ChartRegion | null {
    return this.lastRegion;
  }

  /**
   * Set last detected region.
   */
  setLastRegion(region: ChartRegion): void {
    this.lastRegion = region;
  }

  /**
   * Process a frame and detect changes.
   */
  processFrame(ocrText: string): ChartChangeResult {
    const { identity, changed } = this.detectFromOCR(ocrText);

    const regionChanged = changed;

    const significantChanges: string[] = [];
    if (changed) {
      if (identity.pair !== this.lastIdentity?.pair) {
        significantChanges.push(`Pair: ${this.lastIdentity?.pair} → ${identity.pair}`);
      }
      if (identity.timeframe !== this.lastIdentity?.timeframe) {
        significantChanges.push(`Timeframe: ${this.lastIdentity?.timeframe} → ${identity.timeframe}`);
      }
      if (identity.marketType !== this.lastIdentity?.marketType) {
        significantChanges.push(`Market type: ${this.lastIdentity?.marketType} → ${identity.marketType}`);
      }
    }

    return {
      chartChanged: changed,
      oldIdentity: this.lastIdentity ? {
        pair: this.lastIdentity.pair,
        timeframe: this.lastIdentity.timeframe,
        marketType: this.lastIdentity.marketType,
        confidence: 50,
        ocrText: '',
        frameTimestamp: 0,
      } : null,
      newIdentity: identity,
      regionChanged,
      significantChanges,
    };
  }

  /**
   * Detect and handle asset switch.
   */
  detectAndHandleAssetSwitch(ocrText: string): boolean {
    const result = this.processFrame(ocrText);

    if (result.chartChanged) {
      this.stateMachine.setChartIdentity({
        pair: result.newIdentity.pair,
        timeframe: result.newIdentity.timeframe,
        marketType: result.newIdentity.marketType,
      });
      console.log(`Auto-handled chart change: ${result.significantChanges.join('; ')}`);
      return true;
    }

    return false;
  }

  /**
   * Get current detected identity.
   */
  getCurrentIdentity(): DetectedChartIdentity | null {
    const fromState = this.stateMachine.getChartIdentity();
    if (this.lastIdentity) return this.lastIdentity;
    if (!fromState) return null;
    return {
      pair: fromState.pair || 'UNKNOWN',
      timeframe: fromState.timeframe || 'UNKNOWN',
      marketType: (fromState.marketType === 'LIVE' || fromState.marketType === 'OTC' ? fromState.marketType : 'UNKNOWN'),
      confidence: 50,
      ocrText: '',
      frameTimestamp: Date.now(),
    };
  }
}