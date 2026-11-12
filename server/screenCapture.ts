/**
 * Screen capture and frame processing module.
 * Handles continuous screen capture from the active Quotex shared stream.
 * Resource-efficient sampling, stale frame detection, latency measurement.
 * 
 * Integrates with the existing algorithmic engine for technical analysis.
 */
export type { MonitoringState } from './monitoringStateMachine';
export type { SignalDirection, SignalStatus, SetupClassification } from './monitoringStateMachine';
export type { EvidenceType, EvidenceEntry } from './monitoringStateMachine';
export type { SignalRecord } from './monitoringStateMachine';