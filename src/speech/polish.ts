import { getSettings } from '../settings';

// Async description polish. Dictation lands raw text instantly; if polish is on we then
// send just that TEXT to the server's /polish route (a tiny payload) and let the local
// LLM copy-edit it — adding quotation marks around dialogue and basic punctuation without
// changing the author's words. It can take a while on CPU, so callers run it in the
// background and swap the text in when it resolves. Local-server engine only (that's where
// the LLM lives); other engines have no server to reach.
export function polishAvailable(): boolean {
  const s = getSettings();
  return s.polish && s.engine === 'local';
}

export async function requestPolish(text: string): Promise<string> {
  if (!text.trim()) return text;
  const res = await fetch('/polish', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`Polish failed (${res.status})`);
  const data = await res.json();
  return String(data?.text ?? '').trim() || text;
}
