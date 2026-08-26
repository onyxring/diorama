import { startRecording, isRecordingSupported, type Recorder } from './recorder';
import { activeTranscriber } from './transcriber';
import { setStatus } from '../editor/status';

// A labelled text field (single- or multi-line) with press-and-hold dictation.
// Every editable text box in diorama is built from this, so "hold to talk" is
// available everywhere (#3). Status (model download, transcribing) surfaces through
// the shared non-modal status line, and the mic itself reflects recording/working.

export interface DictField {
  row: HTMLElement;
  input: HTMLInputElement | HTMLTextAreaElement;
  setValue(v: string): void;
}

export interface DictFieldOptions {
  label: string;
  value: string;
  multiline?: boolean;
  onInput: (value: string) => void;
}

export function makeDictField(o: DictFieldOptions): DictField {
  const row = div('field');
  const label = document.createElement('label');
  label.className = 'field-label';
  label.textContent = o.label;

  const wrap = div('field-wrap');
  const input = o.multiline ? document.createElement('textarea') : document.createElement('input');
  input.className = 'field-input';
  input.value = o.value;
  if (input instanceof HTMLTextAreaElement) input.rows = 4;
  else input.type = 'text';
  input.addEventListener('input', () => o.onInput(input.value));

  const mic = document.createElement('button');
  mic.type = 'button';
  mic.className = 'field-mic';
  mic.textContent = '🎤';
  mic.title = 'Hold to talk';

  wrap.append(input, mic);
  row.append(label, wrap);
  attachHoldToTalk(mic, input, () => o.onInput(input.value));

  return { row, input, setValue: (v) => { input.value = v; } };
}

function attachHoldToTalk(
  mic: HTMLButtonElement,
  input: HTMLInputElement | HTMLTextAreaElement,
  onChange: () => void,
): void {
  let recorder: Recorder | null = null;
  let busy = false;

  const start = async () => {
    if (busy || recorder) return;
    if (!isRecordingSupported()) {
      input.focus();               // fall back to the on-screen keyboard's own mic
      setStatus(window.isSecureContext ? 'Mic capture unavailable — use the keyboard 🎤'
                                       : 'In-app dictation needs https — using keyboard 🎤', 3000);
      return;
    }
    const t = activeTranscriber();
    if (!t.isLoaded) void t.load((f, m) => setStatus(`${m} ${Math.round(f * 100)}%`));
    try {
      recorder = await startRecording();
      mic.classList.add('rec');
      setStatus('Listening…');
    } catch {
      setStatus('Microphone blocked', 2500);
      recorder = null;
    }
  };

  const stop = async () => {
    if (!recorder) return;
    const rec = recorder; recorder = null;
    mic.classList.remove('rec');
    mic.classList.add('busy');
    busy = true;
    try {
      const pcm = await rec.stop();
      setStatus(activeTranscriber().isLoaded ? 'Transcribing…' : 'Loading speech model…');
      const text = await activeTranscriber().transcribe(pcm, (f, m) =>
        setStatus(f < 1 ? `${m} ${Math.round(f * 100)}%` : `${m}…`));
      if (text) {
        input.value = (input.value ? input.value.replace(/\s+$/, '') + ' ' : '') + text;
        onChange();
      }
      setStatus(text ? null : 'Didn’t catch that', text ? undefined : 2000);
    } catch {
      setStatus('Transcription failed', 2500);
    } finally {
      busy = false;
      mic.classList.remove('busy');
    }
  };

  mic.addEventListener('pointerdown', (e) => { e.preventDefault(); void start(); });
  mic.addEventListener('pointerup', () => void stop());
  mic.addEventListener('pointercancel', () => void stop());
  mic.addEventListener('pointerleave', () => { if (recorder) void stop(); });
}

function div(cls: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  return d;
}
