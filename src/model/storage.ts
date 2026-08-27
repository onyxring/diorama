import type { World } from './world';
import { emptyWorld } from './world';

// Persist worlds to localStorage, keyed by name, so a refresh (or iOS backgrounding the PWA)
// keeps everything AND you can keep several worlds and switch between them. The model is plain
// serializable data, so this is JSON in/out. Writes are debounced (dictation/drags fire fast)
// and flushed when the tab goes away so an edit right before a refresh still lands.

const KEY = 'diorama.store';
const LEGACY = 'diorama.world';        // the previous single-world key (migrated on first read)
const VERSION = 1;
const DEFAULT_NAME = 'My World';

interface Store {
  version: number;
  current: string;                     // name of the active world (a key in `worlds`)
  worlds: Record<string, World>;       // keyed by world.name
}

// Bring older/partial data up to the current shape (e.g. rooms predating `type`).
function normalize(world: World): World {
  for (const r of world.rooms) {
    if (typeof (r as { type?: unknown }).type !== 'string') r.type = 'object';
  }
  return world;
}

function freshStore(): Store {
  const w = emptyWorld(DEFAULT_NAME);
  return { version: VERSION, current: w.name, worlds: { [w.name]: w } };
}

function readStore(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Store;
      if (s && s.worlds && typeof s.worlds === 'object' && Object.keys(s.worlds).length) {
        for (const w of Object.values(s.worlds)) normalize(w);
        if (!s.worlds[s.current]) s.current = Object.keys(s.worlds)[0];
        return s;
      }
    }
    // migrate the legacy single-world payload, if any
    const legacy = localStorage.getItem(LEGACY);
    if (legacy) {
      const data = JSON.parse(legacy) as { world?: World };
      const w = data?.world;
      if (w && Array.isArray(w.rooms)) {
        w.name = w.name || DEFAULT_NAME;
        normalize(w);
        localStorage.removeItem(LEGACY);
        const s: Store = { version: VERSION, current: w.name, worlds: { [w.name]: w } };
        writeNow(s);
        return s;
      }
    }
  } catch {
    /* fall through to a fresh store */
  }
  return freshStore();
}

const store: Store = readStore();

// ── debounced persistence ─────────────────────────────────────────────────────
let timer: number | undefined;

function writeNow(s: Store = store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* quota / private mode — don't crash the editor */
  }
}

function scheduleWrite(): void {
  if (timer !== undefined) clearTimeout(timer);
  timer = window.setTimeout(() => { timer = undefined; writeNow(); }, 400);
}

if (typeof window !== 'undefined') {
  const flush = () => { if (timer !== undefined) { clearTimeout(timer); timer = undefined; } writeNow(); };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}

// ── public API ────────────────────────────────────────────────────────────────

/** The active world (mutate it freely; call saveCurrent to persist). */
export function currentWorld(): World { return store.worlds[store.current]; }

/** All world names, in insertion order. */
export function worldNames(): string[] { return Object.keys(store.worlds); }

/** Name of the active world. */
export function currentName(): string { return store.current; }

/** Persist the active world. Re-keys automatically if its name changed (a rename). */
export function saveCurrent(world: World): void {
  if (store.current !== world.name) {
    delete store.worlds[store.current];
    store.current = world.name;
  }
  store.worlds[world.name] = world;
  scheduleWrite();
}

/** Switch to an existing world; returns it (or the unchanged current if the name is unknown). */
export function switchTo(name: string): World {
  if (store.worlds[name]) { store.current = name; scheduleWrite(); }
  return currentWorld();
}

function uniqueWorldName(base: string): string {
  const b = base.trim() || DEFAULT_NAME;
  if (!store.worlds[b]) return b;
  let n = 2;
  while (store.worlds[`${b} ${n}`]) n += 1;
  return `${b} ${n}`;
}

/** Create a new (empty) world and make it active. */
export function createNamed(name: string): World {
  const w = emptyWorld(uniqueWorldName(name));
  store.worlds[w.name] = w;
  store.current = w.name;
  scheduleWrite();
  return w;
}

/** Rename a world (no-op if the new name is taken by a different world). */
export function renameWorld(oldName: string, newName: string): void {
  const w = store.worlds[oldName];
  const target = newName.trim();
  if (!w || !target || (store.worlds[target] && target !== oldName)) return;
  delete store.worlds[oldName];
  w.name = target;
  store.worlds[target] = w;
  if (store.current === oldName) store.current = target;
  scheduleWrite();
}

/** Delete a world; returns whichever world is active afterward (creates a default if empty). */
export function deleteNamed(name: string): World {
  delete store.worlds[name];
  if (!Object.keys(store.worlds).length) {
    const w = emptyWorld(DEFAULT_NAME);
    store.worlds[w.name] = w;
    store.current = w.name;
  } else if (store.current === name) {
    store.current = Object.keys(store.worlds)[0];
  }
  scheduleWrite();
  return currentWorld();
}
