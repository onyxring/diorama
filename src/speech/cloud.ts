import type { Transcriber } from './transcriber';
import { getSettings, type Settings } from '../settings';
import { encodeWav } from './wav';

// Cloud speech-to-text via an OpenAI-compatible /audio/transcriptions endpoint. Groq
// and OpenAI share the same multipart shape (a WAV file + model), so one factory covers
// both. The API key comes from Settings (device-local); nothing is stored server-side.
function makeCloud(id: string, label: string, endpoint: string, model: string, keyField: keyof Settings): Transcriber {
  return {
    id,
    label,
    get isLoaded() { return true; },
    load: async () => {},

    async transcribe(pcm16k, _onProgress, _opts) {
      const key = String(getSettings()[keyField] ?? '');
      if (!key) throw new Error(`Add your ${label} API key in Settings`);
      const form = new FormData();
      form.append('file', new File([encodeWav(pcm16k)], 'audio.wav', { type: 'audio/wav' }));
      form.append('model', model);
      form.append('language', 'en');
      form.append('response_format', 'json');

      let res: Response;
      try {
        res = await fetch(endpoint, { method: 'POST', headers: { authorization: `Bearer ${key}` }, body: form });
      } catch {
        throw new Error(`${label} unreachable — check your network`);
      }
      if (!res.ok) throw new Error(`${label} error ${res.status}`);
      const data = await res.json();
      return String(data?.text ?? '').trim();
    },
  };
}

export const groqTranscriber = makeCloud(
  'groq', 'Groq', 'https://api.groq.com/openai/v1/audio/transcriptions', 'whisper-large-v3-turbo', 'groqKey');
export const openaiTranscriber = makeCloud(
  'openai', 'OpenAI', 'https://api.openai.com/v1/audio/transcriptions', 'whisper-1', 'openaiKey');
