import './style.css';
import { emptyWorld } from './model/world';
import { Canvas } from './editor/canvas';
import { getExporter } from './export';

// ── bootstrap ────────────────────────────────────────────────────────────────
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="toolbar">
    <span class="brand">diorama</span>
    <span class="hint">tap: room · drag: connect · hold: dictate</span>
    <button id="export" class="btn">Export Beguile</button>
  </header>
  <main id="stage" class="stage"></main>
  <div id="sheet" class="sheet hidden"><pre id="sheet-code"></pre><button id="sheet-close" class="btn">Close</button></div>
`;

const world = emptyWorld('My World');
const stage = document.querySelector<HTMLElement>('#stage')!;
const canvas = new Canvas(stage, world, () => { /* onChange: hook autosave here later */ });
void canvas;

// ── export ───────────────────────────────────────────────────────────────────
const sheet = document.querySelector<HTMLElement>('#sheet')!;
const sheetCode = document.querySelector<HTMLElement>('#sheet-code')!;
document.querySelector('#export')!.addEventListener('click', () => {
  const exporter = getExporter('beguile')!;
  sheetCode.textContent = exporter.export(world);
  sheet.classList.remove('hidden');
});
document.querySelector('#sheet-close')!.addEventListener('click', () => sheet.classList.add('hidden'));

// ── PWA service worker (registered by vite-plugin-pwa's virtual module) ────────
import { registerSW } from 'virtual:pwa-register';
registerSW({ immediate: true });
