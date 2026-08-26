// ─────────────────────────────────────────────────────────────────────────────
// Microphone capture → 16 kHz mono PCM.
//
// Records with MediaRecorder (works on iOS Safari once mic permission is granted),
// then decodes + downmixes + resamples to the 16 kHz mono Float32 that speech models
// (Whisper) expect. This is the platform-independent capture half of dictation; the
// transcription half is pluggable (see transcriber.ts).
// ─────────────────────────────────────────────────────────────────────────────

export interface Recorder {
  /** Stop recording and return the captured audio as 16 kHz mono PCM. */
  stop(): Promise<Float32Array>;
  /** Abandon the recording (release the mic, no result). */
  cancel(): void;
}

export function isRecordingSupported(): boolean {
  return typeof navigator !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia
    && typeof (window as any).MediaRecorder !== 'undefined';
}

export async function startRecording(): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const rec = new MediaRecorder(stream);
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  rec.start();

  const release = () => stream.getTracks().forEach((t) => t.stop());

  return {
    stop: () =>
      new Promise<Float32Array>((resolve, reject) => {
        rec.onstop = async () => {
          release();
          try {
            resolve(await decodeTo16kMono(new Blob(chunks, { type: rec.mimeType || 'audio/webm' })));
          } catch (err) {
            reject(err);
          }
        };
        try { rec.stop(); } catch (err) { release(); reject(err); }
      }),
    cancel: () => { rec.onstop = null; try { rec.stop(); } catch { /* ignore */ } release(); },
  };
}

// One shared AudioContext for decoding, reused across recordings. Repeatedly creating
// and closing AudioContexts leaks on iOS Safari (a likely contributor to the tab being
// reloaded under memory pressure), so we keep a single suspended context around.
let decodeCtx: AudioContext | null = null;
function getDecodeCtx(): AudioContext {
  if (!decodeCtx) {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    decodeCtx = new AudioCtx();
  }
  return decodeCtx;
}

// Decode a recorded blob (webm/opus on Chromium, mp4/aac on Safari) into a 16 kHz mono
// Float32Array. Connecting a multi-channel source to a 1-channel OfflineAudioContext at
// 16 kHz downmixes and resamples in one pass. The short-lived OfflineAudioContext is fine
// to create per call; it's the persistent (mic/decode) contexts we avoid churning.
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
