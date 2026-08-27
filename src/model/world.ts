// ─────────────────────────────────────────────────────────────────────────────
// The world model — diorama's single source of truth.
//
// The editor and dictation MUTATE this; exporters READ it. Keeping it a plain,
// serializable data structure (no DOM, no framework) means it round-trips to JSON
// for save/load and stays decoupled from both the UI and the output languages.
// ─────────────────────────────────────────────────────────────────────────────

/** Logical/compass directions an exit can carry. Optional — an exit may be undirected. */
export type Direction =
  | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
  | 'u' | 'd' | 'in' | 'out';

export const OPPOSITE: Record<Direction, Direction> = {
  n: 's', s: 'n', e: 'w', w: 'e', ne: 'sw', sw: 'ne', nw: 'se', se: 'nw',
  u: 'd', d: 'u', in: 'out', out: 'in',
};

/** A named value on a room or thing. Exporters map these onto target-language fields. */
export type PropertyValue = string | number | boolean | string[];

/** A Beguile type. Drives both which editor the panel shows and how the value is exported. */
export type PropType =
  | 'string' | 'int' | 'uint' | 'float' | 'bool' | 'dictionaryWord'
  | 'array<string>' | 'array<dictionaryWord>' | 'array<int>';

export const PROP_TYPES: PropType[] = [
  'string', 'int', 'uint', 'float', 'bool', 'dictionaryWord',
  'array<string>', 'array<dictionaryWord>', 'array<int>',
];

export function isArrayType(t: PropType): boolean { return t.startsWith('array<'); }

export interface Property {
  key: string;                 // e.g. "description", "dark", "name"
  value: PropertyValue;
  type?: PropType;             // omitted → inferred from the value / known-key defaults
}

/** A connection from one room to another. */
export interface Exit {
  to: string;                  // target Room id
  dir?: Direction;             // optional direction (drives compass exits on export)
  oneWay?: boolean;            // default false → a reciprocal exit is implied
}

/** An object placed in a room (or, later, inside another thing). */
export interface Thing {
  id: string;
  name: string;
  properties: Property[];
}

/** A world object — a room, an item, an NPC, … Position is editor layout only. (Named `Room`
 *  for historical reasons; `type` distinguishes what it actually is.) */
export interface Room {
  id: string;
  name: string;                // Beguile object identifier — unique; derived from short name once
  type: string;                // "object" (default), "room", "door", … — an authoring label
  x: number;                   // canvas position
  y: number;
  parent?: string;             // id of the containing object, if any
  properties: Property[];      // description, flags, …
  exits: Exit[];
  things: Thing[];
}

/** A whole world — the thing an Exporter turns into source code. */
export interface World {
  name: string;
  start?: string;              // id of the starting room
  rooms: Room[];
}

// ── construction helpers ─────────────────────────────────────────────────────

let counter = 0;
export function newId(prefix = 'r'): string {
  counter += 1;
  return `${prefix}${counter}_${Math.random().toString(36).slice(2, 7)}`;
}

export function emptyWorld(name = 'Untitled World'): World {
  return { name, rooms: [] };
}

export function createRoom(x: number, y: number): Room {
  // No name yet → the first short name given will derive it (see setShortName).
  return { id: newId('r'), name: '', type: 'object', x, y, properties: [], exits: [], things: [] };
}

// A room's `name` is its Beguile OBJECT IDENTIFIER — code, not prose, and unique across the
// world. It's derived from the human short name the FIRST time one is given ("The Dining Room"
// → `diningRoom`); after that it's stable (renaming the short name won't change it), though the
// author may edit it directly. Beguile is case-insensitive, so casing is cosmetic.
export function beguileIdent(s: string): string {
  const stripped = s.trim().replace(/^(the|a|an)\s+/i, '');
  const words = stripped.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (words.length === 0) return '';
  const id = words[0].toLowerCase()
    + words.slice(1).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
  return /^[0-9]/.test(id) ? '_' + id : id;
}

// Coerce arbitrary text into a valid identifier (for manual object-name edits).
function sanitizeIdent(s: string): string {
  const id = s.trim().replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  return /^[0-9]/.test(id) ? '_' + id : id;
}

/** Make `base` unique among the world's object names (appends 2, 3, … on collision). */
export function uniqueName(world: World, base: string, exceptId?: string): string {
  const b = base || 'object';
  const taken = new Set(
    world.rooms.filter((r) => r.id !== exceptId).map((r) => r.name).filter(Boolean),
  );
  if (!taken.has(b)) return b;
  let n = 2;
  while (taken.has(`${b}${n}`)) n += 1;
  return `${b}${n}`;
}

/** The printed name shown to the player / on the canvas (the short name). */
export function printedName(room: Room): string {
  const sn = room.properties.find((p) => p.key === 'short_name')?.value;
  return (sn ? String(sn) : '') || room.name || 'New object';
}

/** Set the printed short name. Derives the object identifier from it ONLY if none is set yet. */
export function setShortName(world: World, room: Room, printed: string): void {
  const t = printed.trim();
  if (t) setProperty(room, 'short_name', t);
  else room.properties = room.properties.filter((p) => p.key !== 'short_name');
  if (!room.name) {
    const base = beguileIdent(t);
    if (base) room.name = uniqueName(world, base, room.id);
  }
}

/** Set the object identifier directly (manual edit); coerced to a valid, unique identifier. */
export function setObjectName(world: World, room: Room, id: string): void {
  const base = sanitizeIdent(id);
  room.name = base ? uniqueName(world, base, room.id) : '';
}

/** Connect two rooms. Adds the reciprocal exit unless one-way. Idempotent; updates
 *  the direction if the exit already exists. */
export function connect(world: World, fromId: string, toId: string, dir?: Direction, oneWay = false): void {
  const from = world.rooms.find(r => r.id === fromId);
  const to = world.rooms.find(r => r.id === toId);
  if (!from || !to || fromId === toId) return;
  const fe = from.exits.find(e => e.to === toId);
  if (fe) { if (dir) fe.dir = dir; } else from.exits.push({ to: toId, dir, oneWay });
  if (!oneWay) {
    const te = to.exits.find(e => e.to === fromId);
    if (te) { if (dir) te.dir = OPPOSITE[dir]; } else to.exits.push({ to: fromId, dir: dir ? OPPOSITE[dir] : undefined });
  }
}

/** Remove the connection between two rooms (both directions). */
export function disconnect(world: World, aId: string, bId: string): void {
  const a = world.rooms.find(r => r.id === aId);
  const b = world.rooms.find(r => r.id === bId);
  if (a) a.exits = a.exits.filter(e => e.to !== bId);
  if (b) b.exits = b.exits.filter(e => e.to !== aId);
}

/** Delete a room and any exits pointing at it. */
export function deleteRoom(world: World, id: string): void {
  world.rooms = world.rooms.filter(r => r.id !== id);
  for (const r of world.rooms) r.exits = r.exits.filter(e => e.to !== id);
  if (world.start === id) world.start = world.rooms[0]?.id;
}

/** Canvas grid cell size; rooms snap to it. */
export const GRID = 40;
export const snap = (v: number): number => Math.round(v / GRID) * GRID;

export function setProperty(target: Room | Thing, key: string, value: PropertyValue): void {
  const existing = target.properties.find(p => p.key === key);
  if (existing) existing.value = value;
  else target.properties.push({ key, value });
}

// Well-known IF property names → their most common Beguile type. Others default to string.
const KNOWN_PROP_TYPES: Record<string, PropType> = {
  description: 'string', initial: 'string', when_on: 'string', when_off: 'string',
  when_open: 'string', when_closed: 'string', before: 'string', after: 'string',
  name: 'array<dictionaryWord>', synonyms: 'array<dictionaryWord>',
  adjective: 'array<dictionaryWord>', plural: 'array<dictionaryWord>',
  dark: 'bool', scenery: 'bool', static: 'bool', concealed: 'bool', edible: 'bool',
  open: 'bool', openable: 'bool', locked: 'bool', lockable: 'bool', container: 'bool',
  supporter: 'bool', enterable: 'bool', switchable: 'bool', on: 'bool', light: 'bool',
  capacity: 'int', weight: 'int',
};

export function defaultPropType(key: string): PropType {
  return KNOWN_PROP_TYPES[key.trim().toLowerCase()] ?? 'string';
}

/** The effective type of a property — explicit, else the known-key default, else inferred. */
export function propType(p: Property): PropType {
  if (p.type) return p.type;
  const known = KNOWN_PROP_TYPES[p.key.trim().toLowerCase()];
  if (known) return known;
  if (typeof p.value === 'boolean') return 'bool';
  if (typeof p.value === 'number') return 'int';
  if (Array.isArray(p.value)) return 'array<string>';
  return 'string';
}

/** Convert a value to another property type (used when the user changes a property's type). */
export function coerceValue(v: PropertyValue, to: PropType): PropertyValue {
  const text = Array.isArray(v) ? v.join(', ') : String(v ?? '');
  const list = Array.isArray(v) ? v : text.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  switch (to) {
    case 'bool': return typeof v === 'boolean' ? v : ['true', 'yes', '1', 'on'].includes(text.trim().toLowerCase());
    case 'int': case 'uint': { const n = parseInt(text, 10); const m = Number.isFinite(n) ? n : 0; return to === 'uint' ? Math.max(0, m) : m; }
    case 'float': { const n = parseFloat(text); return Number.isFinite(n) ? n : 0; }
    case 'dictionaryWord': return text.trim().split(/\s+/)[0] || '';
    case 'array<string>': case 'array<dictionaryWord>': case 'array<int>': return list;
    default: return text;   // 'string'
  }
}

/** The empty/initial value for a property type. */
export function emptyValue(type: PropType): PropertyValue {
  if (isArrayType(type)) return [];
  switch (type) { case 'bool': return false; case 'int': case 'uint': case 'float': return 0; default: return ''; }
}

export function upsertProperty(room: Room, key: string, value: PropertyValue, type?: PropType): void {
  const p = room.properties.find((x) => x.key === key);
  if (p) { p.value = value; if (type) p.type = type; }
  else room.properties.push({ key, value, type: type ?? defaultPropType(key) });
}

export function removeProperty(room: Room, key: string): void {
  room.properties = room.properties.filter((p) => p.key !== key);
}

export function roomName(world: World, id: string): string {
  return world.rooms.find(r => r.id === id)?.name ?? id;
}
