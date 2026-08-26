// ─────────────────────────────────────────────────────────────────────────────
// Microphone capture → 16 kHz mono PCM.
//
// The mic stream is acquired once (ensureMic) and kept open, so a press starts a fresh
// MediaRecorder on the existing stream immediately — no getUserMedia per press. On
// release we decode the recorded blob and resample to 16 kHz mono with the Web Audio
// API (the browser's decoder handles the container/rate correctly — hand-rolled
// resampling of raw ScriptProcessor samples was unreliable on iOS and garbled speech).
//
// Trade-off: the open stream means iOS shows the "mic in use" indicator once warmed.
// ─────────────────────────────────────────────────────────────────────────────

let stream: MediaStream | null = null;
let decodeCtx: AudioContext | null = null;
let recorder: MediaRecorder | null = null;
let chunks: BlobPart[] = [];

export function isRecordingSupported(): boolean {
  return typeof navigator !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia
    && typeof (window as any).MediaRecorder !== 'undefined';
}

/** True once the mic is live and a press will record instantly. */
export function micReady(): boolean { return !!stream; }

/** Acquire the mic (once) and keep it open. Call from a user gesture. */
export async function ensureMic(): Promise<void> {
  if (stream) return;
  stream = await navigator.mediaDevices.getUserMedia({ audio: true });
}

/** Start a fresh recording on the open stream (instant). */
export function beginCapture(): void {
  if (!stream) return;
  chunks = [];
  recorder = new MediaRecorder(stream);
  recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  recorder.start();
}

/** Stop recording and return the captured audio as 16 kHz mono PCM. */
export function endCapture(): Promise<Float32Array> {
  return new Promise((resolve) => {
    const r = recorder;
    recorder = null;
    if (!r || r.state === 'inactive') { resolve(new Float32Array(0)); return; }
    r.onstop = async () => {
      try { resolve(await decodeTo16kMono(new Blob(chunks, { type: r.mimeType || 'audio/webm' }))); }
      catch { resolve(new Float32Array(0)); }
    };
    try { r.stop(); } catch { resolve(new Float32Array(0)); }
  });
}

/** Release the mic entirely (stops the "in use" indicator). */
export function releaseMic(): void {
  try { recorder?.stop(); } catch { /* ignore */ }
  recorder = null; chunks = [];
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}

// Decode a recorded blob (webm/opus on Chromium, mp4/aac on Safari) into 16 kHz mono
// Float32. Connecting a multi-channel source to a 1-channel OfflineAudioContext at
// 16 kHz downmixes and resamples correctly. Reuse one decode context (creating/closing
// them per call leaks on iOS Safari).
function getDecodeCtx(): AudioContext {
  if (!decodeCtx) {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    decodeCtx = new AudioCtx();
  }
  return decodeCtx;
}

async function decodeTo16kMono(blob: Blob): Promise<Float32Array> {
  const decoded = await getDecodeCtx().decodeAudioData(await blob.arrayBuffer());
  const target = 16000;
  const frames = Math.max(1, Math.ceil(decoded.duration * target));
  const offline = new OfflineAudioContext(1, frames, target);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}
