import type { World, Room, Direction } from '../model/world';
import { createRoom, connect, disconnect, snap, GRID, setShortName, printedName } from '../model/world';
import { beginDictation, endDictation } from '../speech/dictate';
import { setStatus } from './status';

const NS = 'http://www.w3.org/2000/svg';
const ROOM_W = 120;
const ROOM_H = 80;
const PORT_R = 9;
const TAP_SLOP = 6;                 // px of movement before a tap becomes a drag
const CONN_HIT = 14;               // px tolerance for tapping a connection line

const DIRS8: Direction[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
const FRAC: Partial<Record<Direction, [number, number]>> = {
  n: [0.5, 0], ne: [1, 0], e: [1, 0.5], se: [1, 1], s: [0.5, 1], sw: [0, 1], w: [0, 0.5], nw: [0, 0],
};

interface Pt { x: number; y: number; }

type Act =
  | { k: 'room'; id: string; gx: number; gy: number; ox: number; oy: number; sx: number; sy: number; pid: number; moved: boolean }
  | { k: 'connect'; from: string; dir: Direction; pid: number; moved: boolean }
  | { k: 'conn'; a: string; b: string; pid: number; moved: boolean }
  | { k: 'empty'; wx: number; wy: number; sx: number; sy: number; pid: number; moved: boolean }
  | { k: 'dictate'; id: string; pid: number }
  | { k: 'pan1'; lx: number; ly: number; pid: number };

export interface CanvasHandlers {
  onSelect(room: Room | null): void;
  onMultiSelect(rooms: Room[]): void;
  onChange(): void;
}

export class Canvas {
  private svg: SVGSVGElement;
  private panX = 0;
  private panY = 0;
  private selectedId: string | null = null;
  private ghost: { from: Pt; to: Pt } | null = null;

  private pointers = new Map<number, Pt>();
  private act: Act | null = null;
  private panning = false;             // two-finger
  private panLast: Pt = { x: 0, y: 0 };
  private lpTimer: number | undefined; // press-and-hold-on-empty timer

  private multi = false;               // "Select" (multi-select) mode
  private multiSel = new Set<string>();
  private pick: ((room: Room) => void) | null = null;  // parent-pick mode (from the panel)
  private newType = 'object';          // type stamped on newly-created objects

  constructor(private host: HTMLElement, private world: World, private h: CanvasHandlers) {
    this.svg = document.createElementNS(NS, 'svg');
    this.svg.setAttribute('class', 'diorama-canvas');
    this.host.appendChild(this.svg);

    this.svg.addEventListener('pointerdown', (e) => this.onDown(e));
    this.svg.addEventListener('pointermove', (e) => this.onMove(e));
    this.svg.addEventListener('pointerup', (e) => this.onUp(e));
    this.svg.addEventListener('pointercancel', (e) => this.onUp(e));

    this.recenter();
  }

  get selected(): Room | null { return this.world.rooms.find(r => r.id === this.selectedId) ?? null; }
  setWorld(w: World) { this.world = w; this.selectedId = null; this.multi = false; this.multiSel.clear(); this.pick = null; this.recenter(); }
  refresh() { this.render(); }
  clearSelection() { this.selectedId = null; this.multiSel.clear(); this.render(); }
  setNewType(t: string) { this.newType = t.trim() || 'object'; }

  select(room: Room | null) {
    this.selectedId = room?.id ?? null;
    this.render();
    this.h.onSelect(this.selected);
  }

  /** Toggle "Select" mode — taps add/remove objects; the panel shows a bulk editor. */
  setMultiMode(on: boolean) {
    this.multi = on;
    this.multiSel.clear();
    this.selectedId = null;
    this.pick = null;
    this.render();
    if (on) { setStatus('Select mode — tap objects to choose them', 2200); this.h.onMultiSelect([]); }
    else this.h.onSelect(null);
  }

  /** Enter parent-pick mode: the next object tapped is passed to `cb`. */
  beginPick(cb: (room: Room) => void) {
    this.pick = cb;
    setStatus('Tap an object to set as its parent (tap empty to cancel)');
  }
  private endPick() { this.pick = null; setStatus(null); }
  private multiRooms(): Room[] { return this.world.rooms.filter(r => this.multiSel.has(r.id)); }
  private isSelected(id: string): boolean { return this.multi ? this.multiSel.has(id) : id === this.selectedId; }

  recenter() {
    const rect = this.host.getBoundingClientRect();
    if (this.world.rooms.length === 0) { this.panX = rect.width / 2; this.panY = rect.height / 2; }
    else {
      let cx = 0, cy = 0;
      for (const r of this.world.rooms) { cx += r.x + ROOM_W / 2; cy += r.y + ROOM_H / 2; }
      cx /= this.world.rooms.length; cy /= this.world.rooms.length;
      this.panX = rect.width / 2 - cx;
      this.panY = rect.height / 2 - cy;
    }
    this.render();
  }

  // ── coordinate transforms ───────────────────────────────────────────────────
  private toWorld(clientX: number, clientY: number): Pt {
    const r = this.svg.getBoundingClientRect();
    return { x: clientX - r.left - this.panX, y: clientY - r.top - this.panY };
  }
  private portPoint(room: Room, dir?: Direction): Pt {
    const f = (dir && FRAC[dir]) || [0.5, 0.5];
    return { x: room.x + f[0] * ROOM_W, y: room.y + f[1] * ROOM_H };
  }
  private roomAt(w: Pt): Room | undefined {
    for (let i = this.world.rooms.length - 1; i >= 0; i--) {
      const r = this.world.rooms[i];
      if (w.x >= r.x && w.x <= r.x + ROOM_W && w.y >= r.y && w.y <= r.y + ROOM_H) return r;
    }
    return undefined;
  }
  private portAt(w: Pt): Direction | null {
    const sel = this.selected;
    if (!sel) return null;
    for (const d of DIRS8) {
      const p = this.portPoint(sel, d);
      if (Math.hypot(w.x - p.x, w.y - p.y) <= PORT_R + 6) return d;
    }
    return null;
  }
  private connAt(w: Pt): { a: string; b: string } | null {
    const seen = new Set<string>();
    for (const r of this.world.rooms) {
      for (const e of r.exits) {
        const key = [r.id, e.to].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        const to = this.world.rooms.find(x => x.id === e.to);
        if (!to) continue;
        const a = this.portPoint(r, e.dir);
        const b = this.portPoint(to, e.dir ? opposite(e.dir) : undefined);
        if (distToSegment(w, a, b) <= CONN_HIT) return { a: r.id, b: to.id };
      }
    }
    return null;
  }

  // ── pointer handling ────────────────────────────────────────────────────────
  private onDown(e: PointerEvent) {
    this.svg.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.pointers.size >= 2) {           // second finger → pan; abandon any 1-finger gesture
      this.clearLp();
      this.act = null; this.ghost = null; this.panning = true; this.panLast = this.centroid();
      this.render();
      return;
    }

    const plain = !this.multi && !this.pick;    // ports/connect/create/dictate only in normal mode
    const w = this.toWorld(e.clientX, e.clientY);
    const dir = plain ? this.portAt(w) : null;
    if (dir && this.selectedId) {
      this.act = { k: 'connect', from: this.selectedId, dir, pid: e.pointerId, moved: false };
      const p = this.portPoint(this.selected!, dir);
      this.ghost = { from: p, to: p };
      return;
    }
    const room = this.roomAt(w);
    if (room) {
      this.act = { k: 'room', id: room.id, gx: w.x - room.x, gy: w.y - room.y, ox: room.x, oy: room.y, sx: e.clientX, sy: e.clientY, pid: e.pointerId, moved: false };
      // press-and-hold on a room → (re)name it by voice; a drag cancels this and moves it
      if (plain) this.lpTimer = window.setTimeout(() => this.onLongPress(e.pointerId), 450);
      return;
    }
    const conn = plain ? this.connAt(w) : null;
    if (conn) { this.act = { k: 'conn', a: conn.a, b: conn.b, pid: e.pointerId, moved: false }; return; }
    this.act = { k: 'empty', wx: w.x, wy: w.y, sx: e.clientX, sy: e.clientY, pid: e.pointerId, moved: false };
    // press-and-hold on empty → create an object here and name it by voice
    if (plain) this.lpTimer = window.setTimeout(() => this.onLongPress(e.pointerId), 450);
  }

  private onMove(e: PointerEvent) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.panning) {
      const c = this.centroid();
      this.panX += c.x - this.panLast.x; this.panY += c.y - this.panLast.y;
      this.panLast = c; this.render(); return;
    }
    const a = this.act;
    if (!a || a.pid !== e.pointerId) return;
    const w = this.toWorld(e.clientX, e.clientY);

    if (a.k === 'room') {
      if (!a.moved && Math.hypot(e.clientX - a.sx, e.clientY - a.sy) < TAP_SLOP) return;
      a.moved = true;
      this.clearLp();                                     // a drag, not a hold → don't dictate
      const r = this.world.rooms.find(x => x.id === a.id);
      if (r) { r.x = w.x - a.gx; r.y = w.y - a.gy; this.render(); }
    } else if (a.k === 'connect') {
      a.moved = true; if (this.ghost) { this.ghost.to = w; this.render(); }
    } else if (a.k === 'empty') {
      if (!a.moved && Math.hypot(e.clientX - a.sx, e.clientY - a.sy) < TAP_SLOP) return;
      this.clearLp();                                                            // a drag, not a hold
      this.act = { k: 'pan1', lx: e.clientX, ly: e.clientY, pid: e.pointerId };  // empty drag → pan
    } else if (a.k === 'pan1') {
      this.panX += e.clientX - a.lx; this.panY += e.clientY - a.ly;
      a.lx = e.clientX; a.ly = e.clientY; this.render();
    }
  }

  private onUp(e: PointerEvent) {
    const world = this.toWorld(e.clientX, e.clientY);
    this.pointers.delete(e.pointerId);
    this.svg.releasePointerCapture?.(e.pointerId);
    this.clearLp();

    if (this.panning) {
      if (this.pointers.size < 2) { this.panning = false; this.act = null; }
      else this.panLast = this.centroid();
      return;
    }
    const a = this.act;
    if (!a || a.pid !== e.pointerId) { if (this.pointers.size === 0) this.act = null; return; }
    this.act = null;

    switch (a.k) {
      case 'room': {
        const r = this.world.rooms.find(x => x.id === a.id);
        if (a.moved) {
          // Dropped onto another object → parent it and snap BACK to where it started (don't
          // leave it covering the parent). Otherwise settle at the dragged-to grid cell.
          if (r) {
            r.x = snap(r.x); r.y = snap(r.y);
            if (this.applyDropParent(r)) { r.x = a.ox; r.y = a.oy; }
          }
          this.h.onChange();
          if (!this.multi && !this.pick) this.select(r ?? null);   // a moved object gains focus
          else this.render();
        } else if (this.pick) {
          if (r) this.pick(r);
          this.endPick();
        } else if (this.multi) {
          if (this.multiSel.has(a.id)) this.multiSel.delete(a.id); else this.multiSel.add(a.id);
          this.render(); this.h.onMultiSelect(this.multiRooms());
        } else {
          this.select(r ?? null);
        }
        break;
      }
      case 'connect': {
        const target = this.roomAt(world);
        this.ghost = null;
        if (target && target.id !== a.from) { connect(this.world, a.from, target.id, a.dir); this.h.onChange(); }
        this.render();
        break;
      }
      case 'conn':
        if (!a.moved) { disconnect(this.world, a.a, a.b); this.render(); this.h.onChange(); }
        break;
      case 'empty':
        if (!a.moved) {
          if (this.pick) this.endPick();                          // tap empty → cancel parent pick
          else if (this.multi) { this.multiSel.clear(); this.render(); this.h.onMultiSelect([]); }
          else {
            const r = createRoom(snap(a.wx - ROOM_W / 2), snap(a.wy - ROOM_H / 2), this.newType);
            this.world.rooms.push(r);
            this.select(r); this.h.onChange();
          }
        }
        break;
      case 'dictate':
        void this.finishDictate(a.id);             // release ends the name dictation
        break;
      case 'pan1':
        this.render();
        break;
    }
  }

  // ── press-and-hold to name by voice ──────────────────────────────────────────
  // On empty space: create a room here first. On an existing room: name that one.
  // Either way we then capture the printed (short) name; the Beguile id is re-derived.
  private onLongPress(pid: number) {
    const a = this.act;
    if (!a || a.pid !== pid) return;
    let id: string;
    if (a.k === 'empty') {
      const room = createRoom(snap(a.wx - ROOM_W / 2), snap(a.wy - ROOM_H / 2), this.newType);
      this.world.rooms.push(room);
      id = room.id;
      this.h.onChange();
    } else if (a.k === 'room') {
      id = a.id;
    } else return;
    this.selectedId = id;
    this.act = { k: 'dictate', id, pid };
    this.render();
    this.h.onSelect(this.world.rooms.find(r => r.id === id) ?? null);   // show it in the panel
    void beginDictation('Listening… name the object');
  }
  private async finishDictate(id: string) {
    const text = await endDictation(true);        // names drop trailing punctuation
    const r = this.world.rooms.find((x) => x.id === id);
    if (r && text) { setShortName(this.world, r, text); this.render(); this.h.onChange(); this.h.onSelect(r); }
  }
  private clearLp() { if (this.lpTimer !== undefined) { clearTimeout(this.lpTimer); this.lpTimer = undefined; } }

  // A room dropped so its center lands on another object becomes that object's child.
  // Returns true if a parent was set (so the caller can snap it back off the parent).
  private applyDropParent(r: Room): boolean {
    const cx = r.x + ROOM_W / 2, cy = r.y + ROOM_H / 2;
    for (let i = this.world.rooms.length - 1; i >= 0; i--) {
      const o = this.world.rooms[i];
      if (o.id === r.id) continue;
      if (cx >= o.x && cx <= o.x + ROOM_W && cy >= o.y && cy <= o.y + ROOM_H) {
        if (this.wouldCycle(r, o)) return false;       // ignore drops that would loop the hierarchy
        r.parent = o.id;
        return true;
      }
    }
    return false;
  }
  // True if making `target` the parent of `r` would create a cycle (target descends from r).
  private wouldCycle(r: Room, target: Room): boolean {
    let cur: Room | undefined = target;
    while (cur) { if (cur.id === r.id) return true; cur = this.world.rooms.find(x => x.id === cur!.parent); }
    return false;
  }

  private centroid(): Pt {
    let x = 0, y = 0;
    for (const p of this.pointers.values()) { x += p.x; y += p.y; }
    const n = this.pointers.size || 1;
    return { x: x / n, y: y / n };
  }

  // ── render ──────────────────────────────────────────────────────────────────
  render() {
    const px = ((this.panX % GRID) + GRID) % GRID;
    const py = ((this.panY % GRID) + GRID) % GRID;
    let s = `
      <defs>
        <pattern id="grid" width="${GRID}" height="${GRID}" patternUnits="userSpaceOnUse"
                 patternTransform="translate(${px} ${py})">
          <path d="M ${GRID} 0 L 0 0 0 ${GRID}" class="grid-line" fill="none"/>
        </pattern>
      </defs>
      <rect class="grid-bg" width="100%" height="100%" fill="url(#grid)"/>
      <g transform="translate(${this.panX} ${this.panY})">`;

    // connections (deduped)
    const seen = new Set<string>();
    for (const r of this.world.rooms) {
      for (const e of r.exits) {
        const key = [r.id, e.to].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        const to = this.world.rooms.find(x => x.id === e.to);
        if (!to) continue;
        const a = this.portPoint(r, e.dir);
        const b = this.portPoint(to, e.dir ? opposite(e.dir) : undefined);
        s += `<line class="exit" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;
      }
    }
    if (this.ghost) s += `<line class="ghost" x1="${this.ghost.from.x}" y1="${this.ghost.from.y}" x2="${this.ghost.to.x}" y2="${this.ghost.to.y}"/>`;

    // parent → child links (dotted, light blue)
    for (const r of this.world.rooms) {
      if (!r.parent) continue;
      const p = this.world.rooms.find(x => x.id === r.parent);
      if (!p) continue;
      s += `<line class="parent-link" x1="${r.x + ROOM_W / 2}" y1="${r.y + ROOM_H / 2}" x2="${p.x + ROOM_W / 2}" y2="${p.y + ROOM_H / 2}"/>`;
    }

    // rooms
    for (const r of this.world.rooms) {
      const cls = 'room' + (this.isSelected(r.id) ? ' selected' : '');
      s += `<g class="${cls}">
        <rect x="${r.x}" y="${r.y}" width="${ROOM_W}" height="${ROOM_H}" rx="10"/>
        <text x="${r.x + ROOM_W / 2}" y="${r.y + ROOM_H / 2}">${escapeXml(printedName(r))}</text>
      </g>`;
    }
    // direction ports on the selected room (normal mode only)
    const sel = !this.multi && !this.pick ? this.selected : null;
    if (sel) for (const d of DIRS8) { const p = this.portPoint(sel, d); s += `<circle class="port" cx="${p.x}" cy="${p.y}" r="${PORT_R}"/>`; }

    s += `</g>`;
    this.svg.innerHTML = s;
  }
}

function opposite(d: Direction): Direction {
  const m: Record<Direction, Direction> = { n: 's', s: 'n', e: 'w', w: 'e', ne: 'sw', sw: 'ne', nw: 'se', se: 'nw', u: 'd', d: 'u', in: 'out', out: 'in' };
  return m[d];
}
function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
function escapeXml(s: string): string {
  return s.replace(/[<>&]/g, (c) => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;'));
}
