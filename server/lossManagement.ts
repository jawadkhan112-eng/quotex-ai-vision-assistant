/**
 * Loss management — honest risk tracking, never a confidence booster.
 * ==========================================================================
 * Rules enforced here:
 *  - A loss NEVER increases prediction confidence and NEVER biases direction.
 *  - After N consecutive losses the engine enters a COOLDOWN: new directional
 *    signals are withheld (WAIT) until the cooldown elapses.
 *  - Configurable maximum-loss limit; when breached, trading is suspended.
 *  - Stake-risk display only — never automatic escalation recommendations
 *    beyond explicit configured steps, never "unlimited martingale".
 */

export interface LossManagementState {
  wins: number;
  losses: number;
  consecutiveLosses: number;
  maxConsecutiveLosses: number;
  cooldownUntil: number | null;
  tradingSuspended: boolean;
  winLossHistory: Array<{ at: string; outcome: 'WIN' | 'LOSS'; direction: string }>;
  riskWarnings: string[];
}

export interface LossManagementConfig {
  /** consecutive losses that trigger a cooldown */
  cooldownAfterLosses: number;
  /** cooldown duration in ms */
  cooldownDurationMs: number;
  /** total loss count at which trading is suspended */
  maxTotalLosses: number;
}

export const DEFAULT_LOSS_CONFIG: LossManagementConfig = {
  cooldownAfterLosses: 3,
  cooldownDurationMs: 5 * 60_000,
  maxTotalLosses: 10,
};

let config: LossManagementConfig = { ...DEFAULT_LOSS_CONFIG };

const state: LossManagementState = {
  wins: 0,
  losses: 0,
  consecutiveLosses: 0,
  maxConsecutiveLosses: 0,
  cooldownUntil: null,
  tradingSuspended: false,
  winLossHistory: [],
  riskWarnings: [],
};

export function configureLossManagement(partial: Partial<LossManagementConfig>): void {
  config = { ...config, ...partial };
}

export function getLossConfig(): LossManagementConfig {
  return { ...config };
}

export interface OutcomeInput { outcome: 'WIN' | 'LOSS'; direction: string; at?: string }

export function reportOutcome(input: OutcomeInput): LossManagementState {
  const at = input.at ?? new Date().toISOString();
  state.winLossHistory.push({ at, outcome: input.outcome, direction: input.direction });
  if (state.winLossHistory.length > 200) state.winLossHistory.shift(); // bounded memory

  if (input.outcome === 'WIN') {
    state.wins++;
    state.consecutiveLosses = 0;
    state.cooldownUntil = null;
    state.riskWarnings = [];
  } else {
    state.losses++;
    state.consecutiveLosses++;
    state.maxConsecutiveLosses = Math.max(state.maxConsecutiveLosses, state.consecutiveLosses);
    state.riskWarnings = [];
    if (state.consecutiveLosses >= config.cooldownAfterLosses) {
      state.cooldownUntil = Date.now() + config.cooldownDurationMs;
      state.riskWarnings.push(`${state.consecutiveLosses} consecutive losses — cooldown active until ${new Date(state.cooldownUntil).toISOString()}. Reduce stake or stop.`);
    }
    if (state.losses >= config.maxTotalLosses) {
      state.tradingSuspended = true;
      state.riskWarnings.push(`Maximum loss limit (${config.maxTotalLosses}) reached — signal execution suspended until manual reset.`);
    }
  }
  return snapshotLossState();
}

/**
 * Gate applied to EVERY new decision. A previous loss NEVER changes the chart
 * direction — it can only add a WAIT (cooldown / suspension) on top.
 */
export function lossGate(now = Date.now()): { blocked: boolean; reason?: string } {
  if (state.tradingSuspended) {
    return { blocked: true, reason: `Trading suspended: maximum loss limit (${config.maxTotalLosses}) reached. Manual reset required.` };
  }
  if (state.cooldownUntil && now < state.cooldownUntil) {
    const secs = Math.ceil((state.cooldownUntil - now) / 1000);
    return { blocked: true, reason: `Cooldown active after ${state.consecutiveLosses} consecutive losses — ${secs}s remaining.` };
  }
  if (state.cooldownUntil && now >= state.cooldownUntil) state.cooldownUntil = null;
  if (state.consecutiveLosses > 0) {
    return { blocked: false, reason: `${state.consecutiveLosses} consecutive loss(es) — stricter entry discipline advised. Direction is NOT influenced by prior losses.` };
  }
  return { blocked: false };
}

export function snapshotLossState(): LossManagementState {
  return {
    wins: state.wins,
    losses: state.losses,
    consecutiveLosses: state.consecutiveLosses,
    maxConsecutiveLosses: state.maxConsecutiveLosses,
    cooldownUntil: state.cooldownUntil,
    tradingSuspended: state.tradingSuspended,
    winLossHistory: [...state.winLossHistory],
    riskWarnings: [...state.riskWarnings],
  };
}

export function resetLossManagement(): void {
  state.wins = 0;
  state.losses = 0;
  state.consecutiveLosses = 0;
  state.maxConsecutiveLosses = 0;
  state.cooldownUntil = null;
  state.tradingSuspended = false;
  state.winLossHistory = [];
  state.riskWarnings = [];
}
