import { beginDictation, endDictation } from './dictate';
import { polishAvailable, requestPolish } from './polish';
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
  attachHoldToTalk(mic, input, !!o.replace, !!o.multiline, () => o.onInput(input.value));

  return { row, input, setValue: (v) => { input.value = v; } };
}

function attachHoldToTalk(
  mic: HTMLButtonElement,
  input: HTMLInputElement | HTMLTextAreaElement,
  replace: boolean,
  longForm: boolean,
  onChange: () => void,
): void {
  let held = false;         // is the button currently pressed?
  let capturing = false;    // are we buffering audio?
  let working = false;      // transcription in flight

  const begin = async () => {
    if (working || capturing) return;
    held = true;
    const ok = await beginDictation();
    if (!ok) { held = false; input.focus(); return; }
    capturing = true;
    mic.classList.add('rec');
    if (!held) void end();                       // released during the one-time mic setup
  };

  const end = async () => {
    held = false;
    if (!capturing) return;
    capturing = false;
    mic.classList.remove('rec'); mic.classList.add('busy');
    working = true;
    const raw = await endDictation(replace);   // replace also strips trailing punctuation (names)
    if (raw) {
      input.value = replace ? raw : (input.value ? input.value.replace(/\s+$/, '') + ' ' : '') + raw;
      onChange();
    }
    working = false;
    mic.classList.remove('busy');
    // Long-form fields get an async copy-edit (quotes + punctuation) that doesn't block.
    if (raw && longForm && polishAvailable()) void polishInBackground(raw);
  };

  // Polish the just-dictated chunk in the background; swap it in when it returns — but only
  // if the field still ends with that exact raw text (user hasn't edited or re-dictated).
  const polishInBackground = async (raw: string) => {
    mic.classList.add('busy');
    setStatus('Polishing in background…', 2500);
    try {
      const polished = await requestPolish(raw);
      if (polished && polished !== raw && input.value.endsWith(raw)) {
        input.value = input.value.slice(0, -raw.length) + polished;
        onChange();
        setStatus('Description polished ✨', 1800);
      }
    } catch {
      setStatus('Polish unavailable', 2000);
    } finally {
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
