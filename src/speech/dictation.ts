// ─────────────────────────────────────────────────────────────────────────────
// Press-and-hold voice dictation.
//
// Uses the Web Speech API (SpeechRecognition) to turn speech into text for a
// property (e.g. a room description). The gesture layer starts dictation on
// long-press and stops it on release.
//
// ⚠ PLATFORM CAVEAT: SpeechRecognition is well-supported in Chromium and desktop
// Safari, but iOS Safari's support is historically spotty — and iPad is the primary
// target. `isSupported()` lets the UI fall back gracefully (e.g. show the OS keyboard
// with its dictation mic, or a cloud-STT path). Keep that fallback in mind when
// wiring the editor; see docs/DESIGN.md → "Dictation on iPad".
// ─────────────────────────────────────────────────────────────────────────────

// Minimal typing for the vendor-prefixed API (not in the DOM lib types).
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
};

function getCtor(): (new () => SpeechRecognitionLike) | undefined {
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function isSupported(): boolean {
  return getCtor() !== undefined;
}

export interface DictationCallbacks {
  /** Fired repeatedly with the best-so-far transcript (interim + final). */
  onText?: (text: string, isFinal: boolean) => void;
  onError?: (message: string) => void;
  onEnd?: () => void;
}

/** A handle to one dictation session — `stop()` on gesture release. */
export interface DictationSession {
  stop(): void;
}

/**
 * Begin a dictation session. Returns null if the platform can't do speech-to-text,
 * so the caller can fall back to text entry.
 */
export function startDictation(cb: DictationCallbacks, lang = 'en-US'): DictationSession | null {
  const Ctor = getCtor();
  if (!Ctor) {
    cb.onError?.('Speech recognition is not available on this device.');
    return null;
  }
  const rec = new Ctor();
  rec.lang = lang;
  rec.interimResults = true;
  rec.continuous = true;

  rec.onresult = (e: any) => {
    let text = '';
    let isFinal = false;
    for (let i = e.resultIndex; i < e.results.length; i++) {
      text += e.results[i][0].transcript;
      if (e.results[i].isFinal) isFinal = true;
    }
    cb.onText?.(text.trim(), isFinal);
  };
  rec.onerror = (e: any) => cb.onError?.(String(e?.error ?? 'speech error'));
  rec.onend = () => cb.onEnd?.();

  try {
    rec.start();
  } catch (err) {
    cb.onError?.(String(err));
    return null;
  }
  return { stop: () => { try { rec.stop(); } catch { /* already stopped */ } } };
}
