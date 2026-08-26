// ─────────────────────────────────────────────────────────────────────────────
// Microphone capture → 16 kHz mono PCM, with INSTANT start.
//
// The mic is acquired once (ensureMic) and the Web Audio graph is kept alive, so a
// press just flips a flag and samples start buffering immediately — no getUserMedia
// or MediaRecorder spin-up per press. Releasing returns the buffered audio, resampled
// to the 16 kHz mono Float32 that speech models expect. Capturing raw PCM also avoids
// the opus/aac encode→decode round-trip, which is a touch cleaner for recognition.
//
// Trade-off: keeping the stream open means iOS shows the "mic in use" indicator once
// warmed. That's the cost of instant, gesture-only recording.
// ─────────────────────────────────────────────────────────────────────────────

let ctx: AudioContext | null = null;
let stream: MediaStream | null = null;
let node: ScriptProcessorNode | null = null;
let inRate = 48000;
let recording = false;
let chunks: Float32Array[] = [];

export function isRecordingSupported(): boolean {
  return typeof navigator !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia
    && (typeof AudioContext !== 'undefined' || typeof (window as any).webkitAudioContext !== 'undefined');
}

/** True once the mic + capture graph are live and a press will record instantly. */
export function micReady(): boolean { return !!(ctx && stream); }

/** Acquire the mic and build the (persistent) capture graph. Call from a user gesture. */
export async function ensureMic(): Promise<void> {
  if (ctx && stream) return;
  const AC = window.AudioContext || (window as any).webkitAudioContext;
  const audioCtx: AudioContext = new AC();
  const s = await navigator.mediaDevices.getUserMedia({ audio: true });
  const source = audioCtx.createMediaStreamSource(s);
  const proc = audioCtx.createScriptProcessor(4096, 1, 1);
  const mute = audioCtx.createGain();
  mute.gain.value = 0;                               // route to destination so the node runs, but silent (no feedback)
  proc.onaudioprocess = (e) => {
    if (!recording) return;
    chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  };
  source.connect(proc);
  proc.connect(mute);
  mute.connect(audioCtx.destination);
  if (audioCtx.state === 'suspended') await audioCtx.resume();
  ctx = audioCtx; stream = s; node = proc; inRate = audioCtx.sampleRate;
}

/** Start buffering samples immediately (assumes ensureMic already ran). */
export function beginCapture(): void { chunks = []; recording = true; }

/** Stop buffering and return the captured audio as 16 kHz mono PCM. */
export function endCapture(): Float32Array {
  recording = false;
  const pcm = flatten(chunks);
  chunks = [];
  return resampleTo16k(pcm, inRate);
}

/** Release the mic entirely (stops the "in use" indicator). Not used in the hot path. */
export function releaseMic(): void {
  recording = false; chunks = [];
  node?.disconnect();
  stream?.getTracks().forEach((t) => t.stop());
  void ctx?.close();
  ctx = null; stream = null; node = null;
}

function flatten(parts: Float32Array[]): Float32Array {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Float32Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

function resampleTo16k(input: Float32Array, rate: number): Float32Array {
  if (rate === 16000 || input.length === 0) return input;
  const ratio = rate / 16000;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const idx = i * ratio;
    const i0 = Math.floor(idx);
    const i1 = Math.min(i0 + 1, input.length - 1);
    out[i] = input[i0] * (1 - (idx - i0)) + input[i1] * (idx - i0);
  }
  return out;
}
