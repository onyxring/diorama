// App settings, persisted in localStorage. Cloud API keys live here (device-local,
// never committed) so users can bring their own without a backend.

export type Engine = 'ondevice' | 'local' | 'groq' | 'openai';

export interface Settings {
  engine: Engine;
  groqKey: string;
  openaiKey: string;
}

const KEY = 'diorama.settings';
const DEFAULTS: Settings = { engine: 'ondevice', groqKey: '', openaiKey: '' };

export function getSettings(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(patch: Partial<Settings>): void {
  localStorage.setItem(KEY, JSON.stringify({ ...getSettings(), ...patch }));
}
