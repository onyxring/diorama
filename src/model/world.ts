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
export type PropertyValue = string | number | boolean;
export interface Property {
  key: string;                 // e.g. "description", "dark", "printedName"
  value: PropertyValue;
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

/** A location. Position is editor layout only; it has no gameplay meaning. */
export interface Room {
  id: string;
  name: string;
  x: number;                   // canvas position
  y: number;
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

export function createRoom(x: number, y: number, name = 'New Room'): Room {
  return { id: newId('r'), name, x, y, properties: [], exits: [], things: [] };
}

/** Connect two rooms. Adds the reciprocal exit unless one-way. Idempotent per direction. */
export function connect(world: World, fromId: string, toId: string, dir?: Direction, oneWay = false): void {
  const from = world.rooms.find(r => r.id === fromId);
  const to = world.rooms.find(r => r.id === toId);
  if (!from || !to || fromId === toId) return;
  if (!from.exits.some(e => e.to === toId)) from.exits.push({ to: toId, dir, oneWay });
  if (!oneWay && !to.exits.some(e => e.to === fromId))
    to.exits.push({ to: fromId, dir: dir ? OPPOSITE[dir] : undefined });
}

export function setProperty(target: Room | Thing, key: string, value: PropertyValue): void {
  const existing = target.properties.find(p => p.key === key);
  if (existing) existing.value = value;
  else target.properties.push({ key, value });
}

export function roomName(world: World, id: string): string {
  return world.rooms.find(r => r.id === id)?.name ?? id;
}
