import './style.css';
import type { World } from './model/world';
import { currentWorld, currentName, saveCurrent } from './model/storage';
import { Canvas } from './editor/canvas';
import { Panel } from './editor/panel';
import { initStatus, setStatus } from './editor/status';
import { ensureMic, isRecordingSupported } from './speech/recorder';
import { openSettings } from './editor/settingsView';
import { openWorlds } from './editor/worldsView';
import { getSettings, saveSettings } from './settings';
import { getExporter } from './export';

// ── layout ───────────────────────────────────────────────────────────────────
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="toolbar">
    <span class="brand">di<span class="or">or</span>ama</span>
    <button id="worlds" class="btn worldname" title="Worlds">${escapeHtml(currentName())} ▾</button>
    <div class="tb-spacer"></div>
    <input id="newtype" class="newtype" list="newtype-list" title="Type for new objects" placeholder="object"/>
    <datalist id="newtype-list"></datalist>
    <button id="select" class="btn icon" title="Select multiple">⬚</button>
    <button id="settings" class="btn icon" title="Settings">⚙</button>
    <button id="recenter" class="btn icon" title="Recenter">⌖</button>
    <button id="export" class="btn">Export</button>
  </header>
  <div class="workspace">
    <main id="stage" class="stage"></main>
    <aside id="panel"></aside>
  </div>
  <div id="status" class="status"></div>
  <div id="sheet" class="sheet hidden">
    <pre id="sheet-code"></pre>
    <div class="sheet-actions">
      <button id="sheet-copy" class="btn">Copy</button>
      <button id="sheet-close" class="btn">Close</button>
    </div>
  </div>
`;

initStatus(document.querySelector<HTMLElement>('#status')!);

let world = currentWorld();
const stage = document.querySelector<HTMLElement>('#stage')!;
const panelHost = document.querySelector<HTMLElement>('#panel')!;
const worldsBtn = document.querySelector<HTMLButtonElement>('#worlds')!;
const selectBtn = document.querySelector<HTMLButtonElement>('#select')!;
const newTypeInput = document.querySelector<HTMLInputElement>('#newtype')!;
const newTypeList = document.querySelector<HTMLDataListElement>('#newtype-list')!;

const save = () => saveCurrent(world);   // debounced; persists across refresh (see model/storage)

let canvas: Canvas;                      // forward ref for the panel's parent-pick callback

const panel = new Panel(
  panelHost,
  world,
  () => { canvas.refresh(); save(); },                          // a field edit → re-render + save
  () => { canvas.clearSelection(); panel.show(null); save(); }, // object(s) deleted
  (cb) => canvas.beginPick(cb),                                 // "Choose parent" → pick on canvas
);

canvas = new Canvas(stage, world, {
  onSelect: (room) => panel.show(room),
  onMultiSelect: (rooms) => panel.showSelection(rooms),
  onChange: () => save(),
});

// Switch/create/delete a world → repoint the editor at it.
const activateWorld = (w: World) => {
  world = w;
  canvas.setWorld(world);
  panel.setWorld(world);
  selectBtn.classList.remove('on');                            // setWorld exits Select mode
  worldsBtn.textContent = `${currentName()} ▾`;
  fillNewTypeList();
};

// Global default type stamped on new objects (persisted). A combo seeded with types in use.
const distinctTypes = (): string[] => {
  const set = new Set<string>(['object', 'room', newTypeInput.value.trim() || 'object']);
  for (const r of world.rooms) if (r.type) set.add(r.type);
  return [...set].filter(Boolean).sort();
};
const fillNewTypeList = () => {
  newTypeList.innerHTML = distinctTypes().map((t) => `<option value="${escapeHtml(t)}"></option>`).join('');
};
newTypeInput.value = getSettings().defaultType || 'object';
canvas.setNewType(newTypeInput.value);
fillNewTypeList();
newTypeInput.addEventListener('change', () => {
  const t = newTypeInput.value.trim() || 'object';
  newTypeInput.value = t;
  saveSettings({ defaultType: t });
  canvas.setNewType(t);
  fillNewTypeList();
});

// ── warm mic + model on first interaction ──────────────────────────────────────
// iOS needs a user gesture to prompt for the mic, so it can't be literally at page open —
// but doing it on the FIRST tap gets the permission dialog out of the way up front (not
// mid-dictation), and prefetches the Whisper model so the first hold-to-talk is ready.
let warmed = false;
app.addEventListener('pointerdown', async () => {
  if (warmed) return;
  warmed = true;
  if (isRecordingSupported()) {
    try { await ensureMic(); }                     // acquire mic + build capture graph → instant presses
    catch { /* denied/unavailable; dictation will report it later */ }
  }
});

// ── toolbar actions ────────────────────────────────────────────────────────────
worldsBtn.addEventListener('click', () => openWorlds(activateWorld));
selectBtn.addEventListener('click', () => {
  const on = !selectBtn.classList.contains('on');
  selectBtn.classList.toggle('on', on);
  canvas.setMultiMode(on);
});
document.querySelector('#settings')!.addEventListener('click', () => openSettings());
document.querySelector('#recenter')!.addEventListener('click', () => canvas.recenter());

const sheet = document.querySelector<HTMLElement>('#sheet')!;
const sheetCode = document.querySelector<HTMLElement>('#sheet-code')!;
document.querySelector('#export')!.addEventListener('click', () => {
  sheetCode.textContent = getExporter('beguile')!.export(world);
  sheet.classList.remove('hidden');
});
document.querySelector('#sheet-copy')!.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(sheetCode.textContent || '');
    setStatus('Copied to clipboard', 1500);
  } catch {
    setStatus('Copy failed — long-press the text to select', 2500);
  }
});
document.querySelector('#sheet-close')!.addEventListener('click', () => sheet.classList.add('hidden'));

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── PWA service worker ──────────────────────────────────────────────────────────
import { registerSW } from 'virtual:pwa-register';
registerSW({ immediate: true });
