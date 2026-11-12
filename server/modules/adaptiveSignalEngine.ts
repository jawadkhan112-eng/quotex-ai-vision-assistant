/**
 * Adaptive Signal Engine - implements the opportunity-based classification that
 * replaces the fixed 80% gate. A 60/100 confluence qualifies a setup; 80+ is
 * HIGH-QUALITY. Below 60 (or with insufficient independent evidence) the setup
 * is DEVELOPING and must keep waiting with an exact, actionable reason.
 */
import { type SetupClass, type SetupAssessment } from '../algorithmicEngine.js';

export type { SetupClassification } from '../monitoringStateMachine.js';

/**
 * Result of adaptive setup evaluation.
 */
export interface AdaptiveSetupResult {
  classification: SetupClass;
  confluenceScore: number;
  alignedEvidence: string[];
  contradictedEvidence: string[];
  summary: string;
  recommendation: 'CALL' | 'PUT' | 'WAIT' | 'PENDING_DIRECTION';
}

/**
 * Evaluate a scored setup with the adaptive thresholds. Delegates the numeric
 * banding to the shared engine so live and screenshot analyses stay identical.
 */
export function evaluateAdaptiveSetup(assessment: SetupAssessment, confluenceScore: number): AdaptiveSetupResult {
  const classification = assessment.classification;
  const aligned = assessment.independentEvidenceCount;
  const summary =
    classification === 'HIGH-QUALITY'
      ? `HIGH-QUALITY setup: confluence ${confluenceScore}/100 across ${aligned} independent evidence sources.`
      : classification === 'QUALIFIED'
        ? `QUALIFIED setup: confluence ${confluenceScore}/100 meets the 60/100 opportunity threshold.`
        : assessment.wait
          ? `DEVELOPING: ${assessment.wait.blockingCondition} Needs: ${assessment.wait.requiredConfirmation}`
          : 'DEVELOPING: insufficient independent evidence.';
  return {
    classification,
    confluenceScore,
    alignedEvidence: Array.from({ length: aligned }, (_, i) => `independent-source-${i + 1}`),
    contradictedEvidence: [],
    summary,
    recommendation: classification === 'DEVELOPING' ? 'WAIT' : 'PENDING_DIRECTION',
  };
}

export { classifySetup, MIN_CONFIDENCE_THRESHOLD, HIGH_QUALITY_THRESHOLD } from '../algorithmicEngine.js';
