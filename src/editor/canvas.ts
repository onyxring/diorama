import type { World, Room } from '../model/world';
import { createRoom, connect, setProperty } from '../model/world';
import { attachGestures, type Point } from './gestures';
import { startDictation, isSupported, type DictationSession } from '../speech/dictation';

const SVG_NS = 'http://www.w3.org/2000/svg';
const ROOM_W = 132;
const ROOM_H = 68;

// A minimal node-graph editor: rooms as boxes, exits as lines, gestures wired to
// the model. Intentionally framework-free — swap in a richer renderer later without
// touching the model or exporters.
export class Canvas {
  private svg: SVGSVGElement;
  private ghost: SVGLineElement | null = null;
  private dictating: DictationSession | null = null;

  constructor(private host: HTMLElement, private world: World, private onChange: () => void) {
    this.svg = document.createElementNS(SVG_NS, 'svg');
    this.svg.setAttribute('class', 'diorama-canvas');
    this.host.appendChild(this.svg);
    this.render();

    attachGestures(this.host, {
      onTap: (p) => {
        if (this.roomAt(p)) return;               // tapping a room ≠ making one (edit later)
        const r = createRoom(p.x - ROOM_W / 2, p.y - ROOM_H / 2);
        this.world.rooms.push(r);
        if (!this.world.start) this.world.start = r.id;
        this.changed();
      },
      onDragStart: (p) => {
        const from = this.roomAt(p);
        if (from) this.beginGhost(this.center(from));
      },
      onDragMove: (from, to) => {
        const src = this.roomAt(from);
        if (src && this.ghost) this.updateGhost(to);
      },
      onDragEnd: (from, to) => {
        const src = this.roomAt(from);
        const dst = this.roomAt(to);
        if (src && dst && src.id !== dst.id) connect(this.world, src.id, dst.id);
        this.endGhost();
        this.changed();
      },
      onLongPressStart: (p) => this.beginDictation(this.roomAt(p)),
      onLongPressEnd: () => this.endDictation(),
    });
  }

  setWorld(world: World) { this.world = world; this.render(); }

  private changed() { this.render(); this.onChange(); }

  private center(r: Room): Point { return { x: r.x + ROOM_W / 2, y: r.y + ROOM_H / 2 }; }

  private roomAt(p: Point): Room | undefined {
    // topmost first
    for (let i = this.world.rooms.length - 1; i >= 0; i--) {
      const r = this.world.rooms[i];
      if (p.x >= r.x && p.x <= r.x + ROOM_W && p.y >= r.y && p.y <= r.y + ROOM_H) return r;
    }
    return undefined;
  }

  // ── dictation (press-and-hold on a room → fill its description) ──────────────
  private beginDictation(room: Room | undefined) {
    if (!room) return;
    this.host.classList.add('is-dictating');
    if (!isSupported()) { setProperty(room, 'description', '[dictation unavailable on this device]'); this.changed(); return; }
    this.dictating = startDictation({
      onText: (text) => { setProperty(room, 'description', text); this.render(); },
      onEnd: () => this.host.classList.remove('is-dictating'),
      onError: () => this.host.classList.remove('is-dictating'),
    });
  }
  private endDictation() {
    this.host.classList.remove('is-dictating');
    this.dictating?.stop();
    this.dictating = null;
    this.onChange();
  }

  // ── drag-to-connect ghost line ──────────────────────────────────────────────
  private beginGhost(from: Point) {
    this.ghost = document.createElementNS(SVG_NS, 'line');
    this.ghost.setAttribute('class', 'ghost');
    this.ghost.setAttribute('x1', String(from.x));
    this.ghost.setAttribute('y1', String(from.y));
    this.ghost.setAttribute('x2', String(from.x));
    this.ghost.setAttribute('y2', String(from.y));
    this.svg.appendChild(this.ghost);
  }
  private updateGhost(to: Point) {
    this.ghost?.setAttribute('x2', String(to.x));
    this.ghost?.setAttribute('y2', String(to.y));
  }
  private endGhost() { this.ghost?.remove(); this.ghost = null; }

  // ── render ──────────────────────────────────────────────────────────────────
  render() {
    while (this.svg.firstChild) this.svg.removeChild(this.svg.firstChild);

    // exits first (behind rooms); draw each undirected pair once
    const drawn = new Set<string>();
    for (const r of this.world.rooms) {
      for (const e of r.exits) {
        const key = [r.id, e.to].sort().join('|');
        if (drawn.has(key)) continue;
        drawn.add(key);
        const to = this.world.rooms.find(x => x.id === e.to);
        if (!to) continue;
        const a = this.center(r), b = this.center(to);
        this.line(a, b, 'exit');
      }
    }
    // rooms
    for (const r of this.world.rooms) this.drawRoom(r);
  }

  private line(a: Point, b: Point, cls: string) {
    const l = document.createElementNS(SVG_NS, 'line');
    l.setAttribute('x1', String(a.x)); l.setAttribute('y1', String(a.y));
    l.setAttribute('x2', String(b.x)); l.setAttribute('y2', String(b.y));
    l.setAttribute('class', cls);
    this.svg.appendChild(l);
  }

  private drawRoom(r: Room) {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'room' + (r.id === this.world.start ? ' start' : ''));
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', String(r.x)); rect.setAttribute('y', String(r.y));
    rect.setAttribute('width', String(ROOM_W)); rect.setAttribute('height', String(ROOM_H));
    rect.setAttribute('rx', '12');
    g.appendChild(rect);
    const label = document.createElementNS(SVG_NS, 'text');
    label.setAttribute('x', String(r.x + ROOM_W / 2));
    label.setAttribute('y', String(r.y + ROOM_H / 2));
    label.textContent = r.name;
    g.appendChild(label);
    this.svg.appendChild(g);
  }
}
