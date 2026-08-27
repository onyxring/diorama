import './style.css';
import { emptyWorld } from './model/world';
import { loadWorld, saveWorld } from './model/storage';
import { Canvas } from './editor/canvas';
import { Panel } from './editor/panel';
import { initStatus } from './editor/status';
import { ensureMic, isRecordingSupported } from './speech/recorder';
import { openSettings } from './editor/settingsView';
import { getExporter } from './export';

// ── layout ───────────────────────────────────────────────────────────────────
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="toolbar">
    <span class="brand">di<span class="or">or</span>ama</span>
    <div class="tb-spacer"></div>
    <button id="settings" class="btn icon" title="Settings">⚙</button>
    <button id="recenter" class="btn icon" title="Recenter">⌖</button>
    <button id="export" class="btn">Export</button>
  </header>
  <div class="workspace">
    <main id="stage" class="stage"></main>
    <aside id="panel"></aside>
  </div>
  <div id="status" class="status"></div>
  <div id="sheet" class="sheet hidden"><pre id="sheet-code"></pre><button id="sheet-close" class="btn">Close</button></div>
`;

initStatus(document.querySelector<HTMLElement>('#status')!);

const world = loadWorld() ?? emptyWorld('My World');
const stage = document.querySelector<HTMLElement>('#stage')!;
const panelHost = document.querySelector<HTMLElement>('#panel')!;

const save = () => saveWorld(world);   // debounced; persists across refresh (see model/storage)

const panel = new Panel(
  panelHost,
  world,
  () => { canvas.refresh(); save(); },              // a field edit → re-render + save
  () => { canvas.select(null); panel.show(null); save(); },  // room deleted
);

const canvas = new Canvas(stage, world, {
  onSelect: (room) => panel.show(room),
  onChange: () => save(),
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
document.querySelector('#settings')!.addEventListener('click', () => openSettings());
document.querySelector('#recenter')!.addEventListener('click', () => canvas.recenter());

const sheet = document.querySelector<HTMLElement>('#sheet')!;
const sheetCode = document.querySelector<HTMLElement>('#sheet-code')!;
document.querySelector('#export')!.addEventListener('click', () => {
  sheetCode.textContent = getExporter('beguile')!.export(world);
  sheet.classList.remove('hidden');
});
document.querySelector('#sheet-close')!.addEventListener('click', () => sheet.classList.add('hidden'));

// ── PWA service worker ──────────────────────────────────────────────────────────
import { registerSW } from 'virtual:pwa-register';
registerSW({ immediate: true });
