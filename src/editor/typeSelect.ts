// A type picker: a native <select> of the types already in use, plus a "+" button to add a
// new one. Picking "+" swaps the dropdown for a small text input (✓ to add, × to cancel).
// This replaces the <datalist> combo, which popped a focus-stealing bubble on some platforms.

export interface TypeSelectOpts {
  value: string;
  options: () => string[];        // evaluated on each (re)render, so it reflects current types
  onChange: (v: string) => void;
  placeholder?: string;
}

export function makeTypeSelect(o: TypeSelectOpts): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'type-select';
  let value = o.value || 'object';

  const renderSelect = () => {
    wrap.innerHTML = '';
    const sel = document.createElement('select');
    sel.className = 'field-input';
    const seen = new Set<string>();
    for (const t of [value, ...o.options()]) {
      const key = (t || '').trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const op = document.createElement('option');
      op.value = key; op.textContent = key; op.selected = key === value;
      sel.appendChild(op);
    }
    sel.addEventListener('change', () => { value = sel.value; o.onChange(value); });
    wrap.append(sel, mkBtn('+', 'Add a new type', renderInput));
  };

  const renderInput = () => {
    wrap.innerHTML = '';
    const input = document.createElement('input');
    input.className = 'field-input';
    input.type = 'text';
    input.placeholder = o.placeholder || 'new type…';
    const commit = () => { const v = input.value.trim(); if (v) { value = v; o.onChange(value); } renderSelect(); };
    input.addEventListener('keydown', (e) => {
      const k = (e as KeyboardEvent).key;
      if (k === 'Enter') commit(); else if (k === 'Escape') renderSelect();
    });
    wrap.append(input, mkBtn('✓', 'Add', commit), mkBtn('×', 'Cancel', renderSelect));
    input.focus();
  };

  renderSelect();
  return wrap;
}

function mkBtn(text: string, title: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'field-btn'; b.textContent = text; b.title = title;
  b.addEventListener('click', onClick);
  return b;
}
