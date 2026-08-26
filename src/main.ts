import './style.css';
import { emptyWorld } from './model/world';
import { Canvas } from './editor/canvas';
import { Panel } from './editor/panel';
import { initStatus } from './editor/status';
import { getExporter } from './export';

// ── layout ───────────────────────────────────────────────────────────────────
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="toolbar">
    <span class="brand">di<span class="or">or</span>ama</span>
    <div class="tb-spacer"></div>
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

const world = emptyWorld('My World');
const stage = document.querySelector<HTMLElement>('#stage')!;
const panelHost = document.querySelector<HTMLElement>('#panel')!;

const save = () => { /* hook autosave (IndexedDB) here later */ };

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

// ── toolbar actions ────────────────────────────────────────────────────────────
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
