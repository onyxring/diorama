import type { World, Room, Property, PropType } from '../model/world';
import { propType, coerceValue, emptyValue, upsertProperty, removeProperty, defaultPropType } from '../model/world';
import { makeDictField } from '../speech/dictateField';

// A typed property list for one object. Each property carries a type that decides its editor:
// text field, dictatable paragraph, number, flag, or a one-per-line string list. Known keys
// (description, name, dark, …) default to their common type; the user can change any of them,
// and the editor swaps to match. A `description` row is always offered even before it exists.
const TYPES: { id: PropType; label: string }[] = [
  { id: 'string', label: 'text' },
  { id: 'text', label: 'paragraph' },
  { id: 'int', label: 'number' },
  { id: 'bool', label: 'flag' },
  { id: 'stringArray', label: 'list' },
];

export function makePropertyList(world: World, room: Room, onChange: () => void): HTMLElement {
  const host = el('div', 'prop-list');

  const rowsToShow = (): Property[] => {
    const props = room.properties.filter((p) => p.key !== 'short_name');   // short_name = the Name field
    if (!props.some((p) => p.key === 'description')) {
      return [{ key: 'description', value: '', type: 'text' }, ...props];   // always offer a description
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
  for (const t of TYPES) {
    const o = document.createElement('option');
    o.value = t.id; o.textContent = t.label; o.selected = t.id === type;
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
  switch (type) {
    case 'text': {                                    // dictatable paragraph
      const f = makeDictField({
        label: '', multiline: true, value: String(p.value ?? ''),
        onInput: (v) => { upsertProperty(room, p.key, v, 'text'); onChange(); },
      });
      return f.row;
    }
    case 'bool': {
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
    case 'int': {
      const i = input('number', String(p.value ?? 0));
      i.addEventListener('change', () => {
        const n = parseInt(i.value, 10);
        upsertProperty(room, p.key, Number.isFinite(n) ? n : 0, 'int'); onChange();
      });
      return i;
    }
    case 'stringArray': {
      const ta = document.createElement('textarea');
      ta.className = 'field-input'; ta.rows = 3;
      ta.placeholder = 'one per line';
      ta.value = Array.isArray(p.value) ? p.value.join('\n') : String(p.value ?? '');
      ta.addEventListener('change', () => {
        const arr = ta.value.split(/\n/).map((s) => s.trim()).filter(Boolean);
        upsertProperty(room, p.key, arr, 'stringArray'); onChange();
      });
      return ta;
    }
    default: {                                        // 'string'
      const i = input('text', String(p.value ?? ''));
      i.addEventListener('change', () => { upsertProperty(room, p.key, i.value, 'string'); onChange(); });
      return i;
    }
  }
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
