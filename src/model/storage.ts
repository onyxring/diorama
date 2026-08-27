import type { World } from './world';

// Persist the world to localStorage so a refresh (or iOS backgrounding the PWA) doesn't lose
// it. The model is already plain serializable data, so this is just JSON in/out. Writes are
// debounced — dictation and drags fire rapidly — and flushed when the tab goes away so an
// edit immediately before a refresh still lands.

const KEY = 'diorama.world';
const VERSION = 1;

interface Saved {
  version: number;
  world: World;
}

/** Load the saved world, or null if there's nothing valid stored. */
export function loadWorld(): World | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<Saved>;
    const world = data?.world;
    if (!world || !Array.isArray(world.rooms)) return null;   // ignore corrupt/foreign data
    return world as World;
  } catch {
    return null;
  }
}

let timer: number | undefined;
let pending: World | null = null;

function writeNow(): void {
  if (!pending) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: VERSION, world: pending } satisfies Saved));
  } catch {
    /* quota exceeded or private-mode: nothing we can do, don't crash the editor */
  }
  pending = null;
}

/** Queue a save of the (mutable) world. Serialized at flush time, so it captures latest state. */
export function saveWorld(world: World): void {
  pending = world;
  if (timer !== undefined) clearTimeout(timer);
  timer = window.setTimeout(writeNow, 400);
}

/** Forget the saved world (used by a "start over" action). */
export function clearWorld(): void {
  pending = null;
  if (timer !== undefined) { clearTimeout(timer); timer = undefined; }
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

// Flush a pending write before the page unloads. On iOS, pagehide/visibilitychange fire
// reliably where beforeunload does not — cover both.
if (typeof window !== 'undefined') {
  const flush = () => {
    if (timer !== undefined) { clearTimeout(timer); timer = undefined; }
    writeNow();
  };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}
