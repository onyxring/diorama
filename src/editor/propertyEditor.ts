import type { World, Room, Property, PropType } from '../model/world';
import {
  PROP_TYPES, isArrayType, propType, coerceValue, emptyValue,
  upsertProperty, removeProperty, defaultPropType,
} from '../model/world';
import { makeDictField } from '../speech/dictateField';
import { beginDictation, endDictation } from '../speech/dictate';

// A typed property list for one object. Each property carries a Beguile TYPE (string, int,
// array<dictionaryWord>, …) that decides its editor: dictatable prose, number, flag, single
// dictionary word, or a one-per-line list. Known keys (description, name, dark, …) default to
// their common type; the user can change any of them, and the editor swaps to match. A
// `description` row is always offered even before it exists.

export function makePropertyList(world: World, room: Room, onChange: () => void): HTMLElement {
  const host = el('div', 'prop-list');

  const rowsToShow = (): Property[] => {
    let rows = room.properties.filter((p) => p.key !== 'short_name');   // short_name = the Name field
    // Always offer the two most common: description (prose) and name (parser vocabulary).
    if (!rows.some((p) => p.key === 'name')) rows = [{ key: 'name', value: [], type: 'array<dictionaryWord>' }, ...rows];
    if (!rows.some((p) => p.key === 'description')) rows = [{ key: 'description', value: '', type: 'string' }, ...rows];
    return rows;
  };

  const render = () => {
    host.innerHTML = '';
    const head = el('div', 'prop-list-head');
    head.textContent = 'Properties';
    host.appendChild(head);
    for (const p of rowsToShow()) host.appendChild(propRow(world, room, p, onChange, render));
    host.appendChild(addRow(room, onChange, render));
  };

  render();
  return host;
}

function propRow(_world: World, room: Room, p: Property, onChange: () => void, rerender: () => void): HTMLElement {
  const type = propType(p);
  const row = el('div', 'prop');

  const head = el('div', 'prop-head');
  const key = el('span', 'prop-key');
  key.textContent = p.key;

  const sel = document.createElement('select');
  sel.className = 'prop-type';
  for (const t of PROP_TYPES) {
    const o = document.createElement('option');
    o.value = t; o.textContent = t; o.selected = t === type;
    sel.appendChild(o);
  }
  sel.addEventListener('change', () => {
    const nt = sel.value as PropType;
    upsertProperty(room, p.key, coerceValue(p.value, nt), nt);   // keep the value, reshaped
    onChange();
    rerender();                                                  // swap the editor to match
  });

  const del = fieldBtn('×', () => { removeProperty(room, p.key); onChange(); rerender(); });
  del.title = 'Remove property';

  head.append(key, sel, del);
  const value = el('div', 'prop-value');
  value.appendChild(valueEditor(room, p, type, onChange));
  row.append(head, value);
  return row;
}

function valueEditor(room: Room, p: Property, type: PropType, onChange: () => void): HTMLElement {
  if (type === 'bool') {
    const wrap = el('label', 'prop-bool') as HTMLLabelElement;
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = p.value === true;
    const span = document.createElement('span');
    span.textContent = cb.checked ? 'on' : 'off';
    cb.addEventListener('change', () => {
      span.textContent = cb.checked ? 'on' : 'off';
      upsertProperty(room, p.key, cb.checked, 'bool'); onChange();
    });
    wrap.append(cb, span);
    return wrap;
  }

  if (type === 'int' || type === 'uint' || type === 'float') {
    const i = input('number', String(p.value ?? 0));
    if (type === 'float') i.step = 'any'; else i.step = '1';
    if (type === 'uint') i.min = '0';
    i.addEventListener('change', () => {
      const n = type === 'float' ? parseFloat(i.value) : parseInt(i.value, 10);
      let m = Number.isFinite(n) ? n : 0;
      if (type === 'uint') m = Math.max(0, m);
      upsertProperty(room, p.key, m, type); onChange();
    });
    return i;
  }

  if (type === 'dictionaryWord') {                    // a single word — dictatable
    const f = makeDictField({
      label: '', value: String(p.value ?? ''), replace: true,
      onInput: (v) => { upsertProperty(room, p.key, v.trim().split(/\s+/)[0] || '', 'dictionaryWord'); onChange(); },
    });
    return f.row;
  }

  if (type === 'array<int>') {                          // numbers: simple one-per-line textarea
    const ta = document.createElement('textarea');
    ta.className = 'field-input'; ta.rows = 3;
    ta.placeholder = 'one per line';
    ta.value = Array.isArray(p.value) ? p.value.join('\n') : String(p.value ?? '');
    ta.addEventListener('change', () => {
      const arr = ta.value.split(/\n/).map((s) => s.trim()).filter(Boolean);
      upsertProperty(room, p.key, arr, type); onChange();
    });
    return ta;
  }

  if (isArrayType(type)) return arrayEditor(room, p, type, onChange);   // word/string chip list

  // 'string' — dictatable prose (descriptions, messages)
  const f = makeDictField({
    label: '', multiline: true, value: String(p.value ?? ''),
    onInput: (v) => { upsertProperty(room, p.key, v, 'string'); onChange(); },
  });
  return f.row;
}

function addRow(room: Room, onChange: () => void, rerender: () => void): HTMLElement {
  const row = el('div', 'prop-add');
  const i = input('text', '');
  i.placeholder = 'add property…';
  const add = () => {
    const key = i.value.trim().toLowerCase().replace(/\s+/g, '_');
    if (!key) return;
    if (!room.properties.some((p) => p.key === key)) {
      const t = defaultPropType(key);
      upsertProperty(room, key, emptyValue(t), t);
    }
    onChange();
    rerender();
  };
  i.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') add(); });
  row.append(i, fieldBtn('＋', add));
  return row;
}

// A chip list for array<dictionaryWord> / array<string>: removable word chips, a "From name"
// seed (for dictionary words), and a "+" that reveals an input + mic to speak or type a word.
function arrayEditor(room: Room, p: Property, type: PropType, onChange: () => void): HTMLElement {
  const wordMode = type === 'array<dictionaryWord>';
  const host = el('div', 'arr-edit');
  const chips = el('div', 'chips');
  const addWrap = el('div', 'arr-add-wrap');
  let adding = false;

  // Read the LIVE value from the model — for the always-offered `name`/`description` rows the
  // property may not exist yet, and upsert creates a new object, so `p` can be a stale placeholder.
  const items = (): string[] => {
    const live = room.properties.find((x) => x.key === p.key);
    const v = live ? live.value : p.value;
    return Array.isArray(v) ? v.map(String) : [];
  };
  const commit = (arr: string[]) => {
    const seen = new Set<string>(); const out: string[] = [];
    for (const raw of arr) {
      const w = raw.trim(); if (!w) continue;
      const low = w.toLowerCase();
      if (seen.has(low)) continue;            // dedupe case-insensitively
      seen.add(low);
      out.push(wordMode ? low : w);           // dictionary words are lowercased
    }
    upsertProperty(room, p.key, out, type); onChange(); renderChips();
  };
  const addTokens = (raw: string) => {
    if (!raw.trim()) return;
    const toks = wordMode ? raw.split(/[^A-Za-z0-9-]+/).filter(Boolean) : [raw.trim()];
    commit([...items(), ...toks]);
  };

  const renderChips = () => {
    chips.innerHTML = '';
    for (const w of items()) {
      const chip = el('span', 'chip');
      chip.textContent = w;
      const x = document.createElement('button');
      x.type = 'button'; x.className = 'chip-x'; x.textContent = '×';
      x.addEventListener('click', () => commit(items().filter((i) => i !== w)));
      chip.appendChild(x);
      chips.appendChild(chip);
    }
  };

  const renderAdd = () => {
    addWrap.innerHTML = '';
    if (!adding) {
      addWrap.appendChild(fieldBtn(wordMode ? '＋ word' : '＋ add', () => { adding = true; renderAdd(); }));
      return;
    }
    const box = input('text', '');
    box.placeholder = wordMode ? 'say or type a word' : 'say or type a value';
    const mic = document.createElement('button');
    mic.type = 'button'; mic.className = 'field-mic'; mic.textContent = '🎤'; mic.title = 'Hold to speak';
    attachWordMic(mic, (t) => { box.value = t; box.focus(); });   // dictation fills the box
    const add = () => { addTokens(box.value); box.value = ''; box.focus(); };   // stays open for more
    box.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') add(); });
    addWrap.append(box, mic, fieldBtn('✓', add), fieldBtn('×', () => { adding = false; renderAdd(); }));
    box.focus();
  };

  host.appendChild(chips);
  if (wordMode) {
    const fromName = fieldBtn('From name', () => {
      const sn = String(room.properties.find((x) => x.key === 'short_name')?.value ?? '');
      const words = sn.split(/[^A-Za-z0-9-]+/).map((w) => w.toLowerCase())
        .filter((w) => w && !['the', 'a', 'an'].includes(w));
      commit([...items(), ...words]);
    });
    fromName.classList.add('arr-fromname');
    fromName.title = 'Add dictionary words from the short name';
    host.appendChild(fromName);
  }
  host.appendChild(addWrap);
  renderChips();
  renderAdd();
  return host;
}

// Hold-to-talk on a mic button → one short utterance, trailing punctuation stripped, handed
// to onText. No polish (single words don't need it).
function attachWordMic(mic: HTMLButtonElement, onText: (t: string) => void): void {
  let held = false, capturing = false, working = false;
  const begin = async () => {
    if (working || capturing) return;
    held = true;
    const ok = await beginDictation('Listening… say a word');
    if (!ok) { held = false; return; }
    capturing = true; mic.classList.add('rec');
    if (!held) void end();
  };
  const end = async () => {
    held = false;
    if (!capturing) return;
    capturing = false; mic.classList.remove('rec'); mic.classList.add('busy'); working = true;
    const text = await endDictation(true);
    if (text) onText(text);
    working = false; mic.classList.remove('busy');
  };
  mic.addEventListener('pointerdown', (e) => { e.preventDefault(); mic.setPointerCapture(e.pointerId); void begin(); });
  mic.addEventListener('pointerup', (e) => { mic.releasePointerCapture?.(e.pointerId); void end(); });
  mic.addEventListener('pointercancel', () => void end());
}

// ── DOM helpers ──────────────────────────────────────────────────────────────
function el(tag: string, cls: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}
function input(type: string, value: string): HTMLInputElement {
  const i = document.createElement('input');
  i.className = 'field-input'; i.type = type; i.value = value;
  return i;
}
function fieldBtn(text: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'field-btn'; b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}
