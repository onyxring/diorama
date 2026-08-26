// ─────────────────────────────────────────────────────────────────────────────
// Touch gesture recognition — the heart of diorama's interaction model.
//
//   • tap          → create a room
//   • drag A→B     → connect two rooms (a "swipe" from one to another)
//   • long-press   → dictate (hold to talk; release to stop)
//
// Built on Pointer Events so touch, pen, and mouse all work. Emits geometric
// intents in element-local coordinates; the editor maps points ↔ rooms.
// ─────────────────────────────────────────────────────────────────────────────

export interface Point { x: number; y: number; }

export interface GestureHandlers {
  onTap?(p: Point): void;
  onDragStart?(p: Point): void;
  onDragMove?(from: Point, to: Point): void;
  onDragEnd?(from: Point, to: Point): void;
  onLongPressStart?(p: Point): void;
  onLongPressEnd?(p: Point): void;
}

const LONG_PRESS_MS = 450;
const MOVE_THRESHOLD = 10; // px before a press becomes a drag

export function attachGestures(el: HTMLElement, h: GestureHandlers): () => void {
  let start: Point | null = null;
  let dragging = false;
  let longPressing = false;
  let timer: number | undefined;

  const local = (e: PointerEvent): Point => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const clearTimer = () => { if (timer !== undefined) { clearTimeout(timer); timer = undefined; } };

  const onDown = (e: PointerEvent) => {
    el.setPointerCapture(e.pointerId);
    start = local(e);
    dragging = false;
    longPressing = false;
    timer = window.setTimeout(() => {
      longPressing = true;
      if (start) h.onLongPressStart?.(start);
    }, LONG_PRESS_MS);
  };

  const onMove = (e: PointerEvent) => {
    if (!start) return;
    const p = local(e);
    const moved = Math.hypot(p.x - start.x, p.y - start.y);
    if (!dragging && !longPressing && moved > MOVE_THRESHOLD) {
      clearTimer();
      dragging = true;
      h.onDragStart?.(start);
    }
    if (dragging) h.onDragMove?.(start, p);
  };

  const onUp = (e: PointerEvent) => {
    clearTimer();
    if (!start) return;
    const p = local(e);
    if (longPressing) h.onLongPressEnd?.(p);
    else if (dragging) h.onDragEnd?.(start, p);
    else h.onTap?.(p);
    start = null; dragging = false; longPressing = false;
  };

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);

  return () => {
    clearTimer();
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onUp);
  };
}
