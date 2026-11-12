/**
 * Core types and utilities for the monitoring system.
 * Re-exports from monitoringStateMachine and chartIdentity.
 */
export { FRAME_SAMPLING_CONFIG, MonitoringStateMachine } from '../monitoringStateMachine.js';
export type { MonitoringState } from '../monitoringStateMachine.js';
export type { SignalDirection, SignalStatus, SetupClassification, EvidenceType, EvidenceEntry, SignalRecord } from '../monitoringStateMachine.js';
export { parsePairFromText, parseMarketTypeFromText, parseTimeframeFromText, describeIdentityChange } from '../chartIdentity.js';
