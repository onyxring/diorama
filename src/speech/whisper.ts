import type { Transcriber, TranscribeProgress } from './transcriber';

// On-device speech-to-text via Whisper, running entirely in the browser with
// transformers.js (WASM, with WebGPU where available). No API key, no server —
// works offline once the model is cached. The library and model are loaded lazily
// on first use so the base app stays small and fast.
//
// Model: whisper-tiny.en is the smallest English model (~40 MB) — a good default for
// an iPad. Swap for `Xenova/whisper-base.en` for better accuracy, or a multilingual
// `Xenova/whisper-tiny` if non-English dictation is needed.
const MODEL = 'Xenova/whisper-tiny.en';

let pipe: any = null;
let loading: Promise<void> | null = null;

async function ensureLoaded(onProgress?: TranscribeProgress): Promise<void> {
  if (pipe) return;
  if (!loading) {
    loading = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');
      env.allowLocalModels = false;              // fetch weights from the Hugging Face CDN
      pipe = await pipeline('automatic-speech-recognition', MODEL, {
        progress_callback: (info: any) => {
          if (info?.status === 'progress') {
            const frac = typeof info.progress === 'number' ? info.progress / 100 : 0;
            onProgress?.(frac, 'downloading speech model');
          }
        },
      });
    })();
  }
  await loading;
}

export const whisperTranscriber: Transcriber = {
  id: 'whisper',
  label: 'Whisper (on-device)',
  get isLoaded() { return pipe !== null; },
  load: (onProgress) => ensureLoaded(onProgress),
  async transcribe(pcm16k, onProgress) {
    await ensureLoaded(onProgress);
    onProgress?.(1, 'transcribing');
    const out: any = await pipe(pcm16k);
    const text = Array.isArray(out) ? out.map((o) => o.text).join(' ') : out?.text;
    return String(text ?? '').trim();
  },
};
