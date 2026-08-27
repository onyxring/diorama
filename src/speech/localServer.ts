import type { Transcriber } from './transcriber';

// Transcribe on a Whisper server running on the host machine (Odin) — the model runs
// there, not on the iPad, so there's no memory pressure and no accuracy penalty. diorama
// POSTs the raw 16 kHz float32 PCM it already has to a same-origin `/stt`; the Vite dev
// server proxies that to the local server (see vite.config.ts + server/).
export const localServerTranscriber: Transcriber = {
  id: 'local',
  label: 'Local server (Odin)',
  get isLoaded() { return true; },
  load: async () => {},

  async transcribe(pcm16k, _onProgress, opts) {
    let res: Response;
    try {
      // ?polish=1 → the server copy-edits (quotes + punctuation) after transcribing, in
      // one round trip. The iPad still makes a single request; the LLM hop is server-local.
      res = await fetch(opts?.polish ? '/stt?polish=1' : '/stt', {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        body: pcm16k.buffer as ArrayBuffer,   // raw float32 bytes (fresh full-buffer array)
      });
    } catch {
      throw new Error('Local server unreachable — is it running (server/run.sh)?');
    }
    if (!res.ok) throw new Error(`Local server error ${res.status}`);
    const data = await res.json();
    return String(data?.text ?? '').trim();
  },
};
