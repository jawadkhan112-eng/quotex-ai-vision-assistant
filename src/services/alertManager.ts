/**
 * Alert & Notification Manager — client-side, no external dependencies.
 *
 * Responsibilities:
 * - In-app alert queue with unique signal IDs (duplicate prevention).
 * - Sound alerts via WebAudio oscillator tones (no audio assets required).
 * - Browser notifications gated behind explicit user permission.
 * - Graceful degradation: if notifications are denied or unsupported, in-app
 *   and sound alerts continue and the reason is reported honestly.
 * - Settings persistence via the backend /api/settings endpoint when available,
 *   falling back to localStorage.
 */

export interface AlertSettings {
  soundEnabled: boolean;
  browserNotificationsEnabled: boolean;
  volume: number; // 0..1
  quietMode: boolean;
  duplicateWindowMs: number;
}

export const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  soundEnabled: true,
  browserNotificationsEnabled: false, // requires explicit permission grant
  volume: 0.4,
  quietMode: false,
  duplicateWindowMs: 30000,
};

export interface AlertPayload {
  signalId: string;
  signal: 'CALL' | 'PUT' | 'WAIT';
  actionBadge: string;
  confidenceScore: number;
  expiryLabel: string;
  timingStatus: string;
  timeframe: string;
  reasoning: string;
  dataQualityWarning?: string;
}

type Listener = (alert: InAppAlert) => void;

export interface InAppAlert extends AlertPayload {
  receivedAt: string;
  channel: 'IN_APP' | 'SOUND' | 'BROWSER';
}

const LS_KEY = 'quotex_alert_settings_v1';

export function loadAlertSettings(): AlertSettings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...DEFAULT_ALERT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* corrupted settings fall back to defaults */ }
  return { ...DEFAULT_ALERT_SETTINGS };
}

export function saveAlertSettings(settings: AlertSettings): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(settings)); } catch { /* storage unavailable — settings stay session-only */ }
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted' || Notification.permission === 'denied') return Notification.permission;
  try { return await Notification.requestPermission(); } catch { return 'denied'; }
}

/** Signal-identifying key used for duplicate-alert prevention. */
export function alertKey(payload: AlertPayload): string {
  return `${payload.signalId}|${payload.signal}|${payload.timeframe}`;
}

export class AlertManager {
  private settings: AlertSettings;
  private audioContext: AudioContext | null = null;
  private lastAlertKey: string | null = null;
  private lastAlertAt = 0;
  private listeners = new Set<Listener>();
  private history: InAppAlert[] = [];

  constructor(settings?: AlertSettings) {
    this.settings = settings ?? loadAlertSettings();
  }

  getSettings(): AlertSettings {
    return { ...this.settings };
  }

  updateSettings(next: Partial<AlertSettings>): AlertSettings {
    this.settings = { ...this.settings, ...next };
    saveAlertSettings(this.settings);
    return this.getSettings();
  }

  onAlert(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getHistory(): InAppAlert[] {
    return [...this.history];
  }

  /** Returns the channels the alert was actually delivered on (honest report). */
  async dispatch(payload: AlertPayload): Promise<Array<InAppAlert['channel']>> {
    const key = alertKey(payload);
    const now = Date.now();
    // Duplicate prevention: same signal within the duplicate window is suppressed.
    if (key === this.lastAlertKey && now - this.lastAlertAt < this.settings.duplicateWindowMs) {
      return [];
    }
    this.lastAlertKey = key;
    this.lastAlertAt = now;

    const delivered: Array<InAppAlert['channel']> = [];
    const receivedAt = new Date().toISOString();
    const push = (channel: InAppAlert['channel']) => {
      const alert: InAppAlert = { ...payload, receivedAt, channel };
      this.history.unshift(alert);
      if (this.history.length > 100) this.history.length = 100;
      this.listeners.forEach((l) => l(alert));
      delivered.push(channel);
    };

    const quiet = this.settings.quietMode;
    // In-app alerts always fire (they are the UI itself).
    push('IN_APP');

    if (!quiet && this.settings.soundEnabled) {
      this.playTone(payload.signal);
      push('SOUND');
    }

    if (!quiet && this.settings.browserNotificationsEnabled && notificationPermission() === 'granted') {
      try {
        new Notification(`${payload.actionBadge} · ${payload.confidenceScore}%`, {
          body: `${payload.timeframe} · ${payload.expiryLabel} · timing ${payload.timingStatus}\n${payload.reasoning.slice(0, 140)}`,
          tag: payload.signalId, // browser-level dedup too
        });
        push('BROWSER');
      } catch { /* notification failure degrades to in-app only */ }
    }

    return delivered;
  }

  /** Distinct tones per signal direction. */
  private playTone(signal: AlertPayload['signal']): void {
    try {
      this.audioContext ??= new AudioContext();
      const ctx = this.audioContext;
      const freq = signal === 'CALL' ? 880 : signal === 'PUT' ? 440 : 520;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.frequency.value = freq;
      gain.gain.setValueAtTime(Math.max(0.001, this.settings.volume), ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.35);
    } catch { /* audio unavailable — silent degradation */ }
  }

  dispose(): void {
    this.listeners.clear();
    this.audioContext?.close().catch(() => { /* already closed */ });
    this.audioContext = null;
  }
}

/** Shared singleton so all views observe the same alert stream and dedup state. */
export const alertManager = new AlertManager();
