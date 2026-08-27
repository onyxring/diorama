import type { Room, World } from '../model/world';
import { deleteRoom, setShortName, setObjectName, printedName } from '../model/world';
import { makeDictField } from '../speech/dictateField';
import { makePropertyList } from './propertyEditor';

// The right-hand property panel (collapsible). Edits write straight through to the model
// (the source of truth) and re-render the canvas. Shows a single object's fields, or — when
// several are selected in "Select" mode — a bulk editor that applies to all of them.
export class Panel {
  private body: HTMLElement;
  private collapsed = false;

  constructor(
    private root: HTMLElement,
    private world: World,
    private onChange: () => void,
    private onDeleted: () => void,
    private onPickParent: (cb: (parent: Room) => void) => void,
  ) {
    root.classList.add('panel');
    root.innerHTML = `
      <button class="panel-toggle" title="Show/hide properties">⟩</button>
      <div class="panel-body"></div>`;
    this.body = root.querySelector('.panel-body')!;
    root.querySelector('.panel-toggle')!.addEventListener('click', () => this.toggle());
    this.show(null);
  }

  setWorld(w: World) { this.world = w; this.show(null); }
  toggle() { this.collapsed = !this.collapsed; this.root.classList.toggle('collapsed', this.collapsed); }
  private expand() { if (this.collapsed) this.toggle(); }

  /** Convenience for single selection / clearing. */
  show(room: Room | null): void { this.showSelection(room ? [room] : []); }

  /** Render for the current selection: empty hint, single editor, or bulk editor. */
  showSelection(rooms: Room[]): void {
    this.body.innerHTML = '';
    if (rooms.length === 0) return this.showEmpty();
    this.expand();
    if (rooms.length === 1) this.showOne(rooms[0]);
    else this.showBulk(rooms);
  }

  private showEmpty(): void {
    const hint = div('panel-empty');
    hint.textContent = 'Tap empty space to add an object; tap one to edit it.';
    this.body.appendChild(hint);
  }

  // ── single object ─────────────────────────────────────────────────────────────
  private showOne(room: Room): void {
    // Name (printed / short name) — dictatable. Derives the object id only while none is set.
    const idField = textField('Beguile object name', room.name, (v) => { setObjectName(this.world, room, v); this.onChange(); });
    const syncId = () => { idField.input.value = room.name; };

    const name = makeDictField({
      label: 'Name', value: printedName(room), replace: true,
      onInput: (v) => { setShortName(this.world, room, v); syncId(); this.onChange(); },
    });
    // Capitalize Each Word — locations are usually titled ("The Dining Room"); objects aren't.
    const cap = button('field-btn', 'Aa', () => {
      const v = titleCase(name.input.value);
      name.input.value = v; setShortName(this.world, room, v); syncId(); this.onChange();
    });
    cap.title = 'Capitalize Each Word (for locations)';
    name.row.querySelector('.field-wrap')?.appendChild(cap);

    // Type — plain text, default "object" (no reason to dictate it).
    const type = textField('Type', room.type || 'object', (v) => { room.type = v.trim() || 'object'; this.onChange(); });

    const parent = this.parentField(room);
    const props = makePropertyList(this.world, room, () => this.onChange());

    const del = button('panel-delete btn', 'Delete', () => { deleteRoom(this.world, room.id); this.onDeleted(); });

    this.body.append(name.row, idField.row, type.row, parent, props, del);
    name.input.focus();
  }

  // Parent: a read-only display of the chosen object + a Choose button (pick on canvas) + clear.
  private parentField(room: Room): HTMLElement {
    const row = div('field');
    const label = document.createElement('label');
    label.className = 'field-label';
    label.textContent = 'Parent';

    const wrap = div('field-wrap');
    const view = document.createElement('div');
    view.className = 'field-input parent-view';
    const render = () => {
      const p = room.parent ? this.world.rooms.find(r => r.id === room.parent) : undefined;
      view.textContent = p ? (p.name || printedName(p)) : '—';
      view.classList.toggle('muted', !p);
    };
    render();

    const choose = button('field-btn', 'Choose', () => {
      this.onPickParent((picked) => {
        if (picked.id !== room.id) { room.parent = picked.id; render(); this.onChange(); }
      });
    });
    const clear = button('field-btn', '×', () => { delete room.parent; render(); this.onChange(); });
    clear.title = 'Clear parent';

    wrap.append(view, choose, clear);
    row.append(label, wrap);
    return row;
  }

  // ── bulk (multi-select) ────────────────────────────────────────────────────────
  private showBulk(rooms: Room[]): void {
    const head = div('panel-empty');
    head.textContent = `${rooms.length} objects selected`;

    // Type applies to all selected. Blank if they differ; typing sets them all.
    const shared = rooms.every(r => r.type === rooms[0].type) ? (rooms[0].type || 'object') : '';
    const type = textField('Type (all selected)', shared, (v) => {
      const t = v.trim() || 'object';
      for (const r of rooms) r.type = t;
      this.onChange();
    });
    if (!shared) type.input.placeholder = '(mixed)';

    const del = button('panel-delete btn', `Delete ${rooms.length}`, () => {
      for (const r of rooms) deleteRoom(this.world, r.id);
      this.onDeleted();
    });

    this.body.append(head, type.row, del);
  }
}

// ── small DOM helpers ────────────────────────────────────────────────────────────
function textField(label: string, value: string, onCommit: (v: string) => void): { row: HTMLElement; input: HTMLInputElement } {
  const row = div('field');
  const lab = document.createElement('label');
  lab.className = 'field-label';
  lab.textContent = label;
  const input = document.createElement('input');
  input.className = 'field-input';
  input.type = 'text';
  input.value = value;
  // Commit on change (blur/enter) so identifier de-duplication doesn't fight the cursor.
  input.addEventListener('change', () => onCommit(input.value));
  row.append(lab, input);
  return { row, input };
}

function button(cls: string, text: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

function div(cls: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  return d;
}

function titleCase(s: string): string {
  return s.replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1));
}
