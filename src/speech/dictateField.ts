import { ensureMic, beginCapture, endCapture, micReady, isRecordingSupported } from './recorder';
import { activeTranscriber } from './transcriber';
import { setStatus } from '../editor/status';

// A labelled text field (single- or multi-line) with press-and-hold dictation.
// Every editable text box in diorama is built from this, so "hold to talk" is
// available everywhere (#3). The mic records ONLY while held; releasing stops it.
// Names replace their contents; descriptions append.

export interface DictField {
  row: HTMLElement;
  input: HTMLInputElement | HTMLTextAreaElement;
  setValue(v: string): void;
}

export interface DictFieldOptions {
  label: string;
  value: string;
  multiline?: boolean;
  replace?: boolean;                 // true → dictation overwrites (names); false → append (descriptions)
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
  attachHoldToTalk(mic, input, !!o.replace, () => o.onInput(input.value));

  return { row, input, setValue: (v) => { input.value = v; } };
}

function attachHoldToTalk(
  mic: HTMLButtonElement,
  input: HTMLInputElement | HTMLTextAreaElement,
  replace: boolean,
  onChange: () => void,
): void {
  let held = false;         // is the button currently pressed?
  let capturing = false;    // are we buffering audio?
  let working = false;      // transcription in flight

  const begin = async () => {
    if (working) return;
    held = true;
    if (!isRecordingSupported()) {
      held = false;
      input.focus();
      setStatus(window.isSecureContext ? 'Mic capture unavailable — use the keyboard 🎤'
                                       : 'In-app dictation needs https — using keyboard 🎤', 3000);
      return;
    }
    if (!micReady()) {                          // first-ever press: acquire the mic (one-time)
      setStatus('Enabling mic…');
      try { await ensureMic(); }
      catch { held = false; mic.classList.remove('rec'); setStatus('Microphone blocked', 2500); return; }
      if (!held) { setStatus(null); return; }   // released during the one-time setup
    }
    beginCapture();                             // instant from here on
    capturing = true;
    mic.classList.add('rec');
    setStatus('Listening… release to transcribe');
  };

  const end = async () => {
    held = false;
    if (!capturing) { mic.classList.remove('rec'); return; }
    capturing = false;
    const pcm = endCapture();
    mic.classList.remove('rec'); mic.classList.add('busy');
    working = true;
    setStatus(activeTranscriber().isLoaded ? 'Transcribing…' : 'Loading speech model…');
    try {
      const text = await activeTranscriber().transcribe(pcm, (f, m) =>
        setStatus(f < 1 ? `${m} ${Math.round(f * 100)}%` : `${m}…`));
      if (text) {
        input.value = replace ? text : (input.value ? input.value.replace(/\s+$/, '') + ' ' : '') + text;
        onChange();
      }
      setStatus(text ? null : 'Didn’t catch that', text ? undefined : 1800);
    } catch {
      setStatus('Transcription failed', 2500);
    } finally {
      working = false;
      mic.classList.remove('busy');
    }
  };

  mic.addEventListener('pointerdown', (e) => { e.preventDefault(); mic.setPointerCapture(e.pointerId); void begin(); });
  mic.addEventListener('pointerup', (e) => { mic.releasePointerCapture?.(e.pointerId); void end(); });
  mic.addEventListener('pointercancel', () => void end());
}

function div(cls: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  return d;
}
