import type { World, Room, Property, PropType } from '../model/world';
import {
  PROP_TYPES, isArrayType, propType, coerceValue, emptyValue,
  upsertProperty, removeProperty, defaultPropType,
} from '../model/world';
import { makeDictField } from '../speech/dictateField';

// A typed property list for one object. Each property carries a Beguile TYPE (string, int,
// array<dictionaryWord>, …) that decides its editor: dictatable prose, number, flag, single
// dictionary word, or a one-per-line list. Known keys (description, name, dark, …) default to
// their common type; the user can change any of them, and the editor swaps to match. A
// `description` row is always offered even before it exists.

export function makePropertyList(world: World, room: Room, onChange: () => void): HTMLElement {
  const host = el('div', 'prop-list');

  const rowsToShow = (): Property[] => {
    const props = room.properties.filter((p) => p.key !== 'short_name');   // short_name = the Name field
    if (!props.some((p) => p.key === 'description')) {
      return [{ key: 'description', value: '', type: 'string' }, ...props];   // always offer a description
    }
    return props;
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

  if (isArrayType(type)) {                             // one item per line
    const ta = document.createElement('textarea');
    ta.className = 'field-input'; ta.rows = 3;
    ta.placeholder = type === 'array<dictionaryWord>' ? 'one word per line' : 'one per line';
    ta.value = Array.isArray(p.value) ? p.value.join('\n') : String(p.value ?? '');
    ta.addEventListener('change', () => {
      const arr = ta.value.split(/\n/).map((s) => s.trim()).filter(Boolean);
      upsertProperty(room, p.key, arr, type); onChange();
    });
    return ta;
  }

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
