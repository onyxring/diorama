// App settings, persisted in localStorage. Cloud API keys live here (device-local,
// never committed) so users can bring their own without a backend.

export type Engine = 'ondevice' | 'local' | 'groq' | 'openai';

export interface Settings {
  engine: Engine;
  groqKey: string;
  openaiKey: string;
  polish: boolean;         // LLM copy-edit of long-form dictation (local server only)
  defaultType: string;     // type stamped on newly-created objects
}

const KEY = 'diorama.settings';
const DEFAULTS: Settings = { engine: 'ondevice', groqKey: '', openaiKey: '', polish: true, defaultType: 'object' };

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
