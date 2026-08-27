import type { Room, World } from '../model/world';
import { setProperty, deleteRoom, setShortName, printedName } from '../model/world';
import { makeDictField } from '../speech/dictateField';

// The right-hand property panel (collapsible). Shows the selected room's fields —
// all dictatable — replacing the old modal dialog. The model is the source of truth;
// edits write straight through and re-render the canvas.
export class Panel {
  private body: HTMLElement;
  private collapsed = false;

  constructor(
    private root: HTMLElement,
    private world: World,
    private onChange: () => void,
    private onDeleted: () => void,
  ) {
    root.classList.add('panel');
    root.innerHTML = `
      <button class="panel-toggle" title="Show/hide properties">⟩</button>
      <div class="panel-body"></div>`;
    this.body = root.querySelector('.panel-body')!;
    root.querySelector('.panel-toggle')!.addEventListener('click', () => this.toggle());
    this.show(null);
  }

  toggle() { this.collapsed = !this.collapsed; this.root.classList.toggle('collapsed', this.collapsed); }
  private expand() { if (this.collapsed) this.toggle(); }

  show(room: Room | null): void {
    this.body.innerHTML = '';
    if (!room) {
      const hint = document.createElement('div');
      hint.className = 'panel-empty';
      hint.textContent = 'Tap empty space to add a room; tap a room to edit it.';
      this.body.appendChild(hint);
      return;
    }
    this.expand();
    const prop = (k: string) => String(room.properties.find(p => p.key === k)?.value ?? '');
    const write = (k: string, v: string) => {
      const t = v.trim();
      if (t) setProperty(room, k, t);
      else room.properties = room.properties.filter(p => p.key !== k);
      this.onChange();
    };

    // "Name" is the printed short name (dictatable). The Beguile object identifier is
    // DERIVED from it — never typed or dictated — and shown read-only below.
    const idLine = document.createElement('div');
    idLine.className = 'panel-id';
    const refreshId = () => { idLine.textContent = `Beguile id: ${room.name}`; };
    refreshId();

    const name = makeDictField({
      label: 'Name', value: printedName(room), replace: true,
      onInput: (v) => { setShortName(room, v); refreshId(); this.onChange(); },
    });
    const desc = makeDictField({ label: 'Description', multiline: true, value: prop('description'), onInput: (v) => write('description', v) });

    const del = document.createElement('button');
    del.className = 'panel-delete btn';
    del.textContent = 'Delete room';
    del.addEventListener('click', () => { deleteRoom(this.world, room.id); this.onDeleted(); });

    this.body.append(name.row, idLine, desc.row, del);
    name.input.focus();
  }
}
