import type { World } from '../model/world';
import {
  worldNames, currentName, switchTo, createNamed, renameWorld, deleteNamed,
} from '../model/storage';

// Sheet for managing multiple worlds: switch, create, rename, delete. Calls onActivate with
// the world that should become active (after a switch/create/delete). Storage is the source
// of truth; this just drives it.
export function openWorlds(onActivate: (world: World) => void): void {
  const overlay = document.createElement('div');
  overlay.className = 'sheet settings-sheet';
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  const activate = (w: World) => { onActivate(w); close(); };

  const render = () => {
    const cur = currentName();
    overlay.innerHTML = `
      <div class="settings-panel">
        <h2>Worlds</h2>
        <div class="world-list">
          ${worldNames().map(n => `
            <div class="world-row ${n === cur ? 'on' : ''}" data-name="${esc(n)}">
              <button class="world-open" data-name="${esc(n)}">${esc(n)}${n === cur ? ' •' : ''}</button>
              <button class="field-btn" data-act="rename" data-name="${esc(n)}" title="Rename">✎</button>
              <button class="field-btn" data-act="delete" data-name="${esc(n)}" title="Delete">🗑</button>
            </div>`).join('')}
        </div>
        <div class="world-new">
          <input class="field-input" id="world-new-name" type="text" placeholder="New world name…"/>
          <button class="btn" id="world-new-add">Add</button>
        </div>
        <div class="settings-actions"><button class="btn" id="worlds-done">Done</button></div>
      </div>`;

    overlay.querySelectorAll<HTMLButtonElement>('.world-open').forEach(b =>
      b.addEventListener('click', () => activate(switchTo(b.dataset.name!))));

    overlay.querySelectorAll<HTMLButtonElement>('[data-act="rename"]').forEach(b =>
      b.addEventListener('click', () => {
        const name = b.dataset.name!;
        const next = window.prompt('Rename world', name);
        if (next && next.trim() && next.trim() !== name) { renameWorld(name, next.trim()); render(); }
      }));

    overlay.querySelectorAll<HTMLButtonElement>('[data-act="delete"]').forEach(b =>
      b.addEventListener('click', () => {
        const name = b.dataset.name!;
        if (!window.confirm(`Delete “${name}”? This can't be undone.`)) return;
        const wasCurrent = name === currentName();
        const nowCurrent = deleteNamed(name);
        if (wasCurrent) onActivate(nowCurrent);   // active world gone → editor follows to the new current
        render();
      }));

    const add = () => {
      const input = overlay.querySelector<HTMLInputElement>('#world-new-name')!;
      const name = input.value.trim();
      if (name) activate(createNamed(name));
    };
    overlay.querySelector('#world-new-add')!.addEventListener('click', add);
    overlay.querySelector('#world-new-name')!.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') add();
    });
    overlay.querySelector('#worlds-done')!.addEventListener('click', close);
  };

  render();
  overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) close(); });
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
