import { ensureMic, beginCapture, endCapture, micReady, isRecordingSupported } from './recorder';
import { activeTranscriber } from './transcriber';
import { setStatus } from '../editor/status';

// Shared one-shot dictation: begin on press, end on release. Used by the panel's
// dictatable fields and by the canvas's press-and-hold-to-name gesture, so the mic
// handling, status, and text cleanup live in one place.

let active = false;

/** Begin capturing. Returns false (with a status message) if the mic can't be used. */
export async function beginDictation(listeningMsg = 'Listening… release to transcribe'): Promise<boolean> {
  if (active) return false;
  if (!isRecordingSupported()) {
    setStatus(window.isSecureContext ? 'Mic capture unavailable — use the keyboard 🎤'
                                     : 'In-app dictation needs https — using keyboard 🎤', 3000);
    return false;
  }
  if (!micReady()) {
    setStatus('Enabling mic…');
    try { await ensureMic(); } catch { setStatus('Microphone blocked', 2500); return false; }
  }
  beginCapture();
  active = true;
  setStatus(listeningMsg);
  return true;
}

/** Stop capturing and transcribe. `stripTrailingPunct` for name-like fields (#1). */
export async function endDictation(stripTrailingPunct = false): Promise<string> {
  if (!active) return '';
  active = false;
  const pcm = await endCapture();
  setStatus(activeTranscriber().isLoaded ? 'Transcribing…' : 'Loading speech model…');
  try {
    let text = await activeTranscriber().transcribe(pcm, (f, m) =>
      setStatus(f < 1 ? `${m} ${Math.round(f * 100)}%` : `${m}…`));
    if (stripTrailingPunct) text = text.replace(/[.,;:!?…\s]+$/u, '');
    setStatus(text ? null : 'Didn’t catch that', text ? undefined : 1800);
    return text;
  } catch {
    setStatus('Transcription failed', 2500);
    return '';
  }
}

export function dictationActive(): boolean { return active; }
