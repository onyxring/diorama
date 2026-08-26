// A single, non-modal status line — the app's quiet "what's happening" indicator
// (downloading a model, transcribing, …). Nothing blocks; it just appears and fades.
// Richer per-element indicators can layer on top later; this is the shared channel.

let el: HTMLElement | null = null;
let hideTimer: number | undefined;

export function initStatus(element: HTMLElement): void {
  el = element;
}

/** Show a message (persists until changed/cleared), or pass null to hide. */
export function setStatus(text: string | null, autoHideMs?: number): void {
  if (!el) return;
  if (hideTimer !== undefined) { clearTimeout(hideTimer); hideTimer = undefined; }
  if (text) {
    el.textContent = text;
    el.classList.add('show');
    if (autoHideMs) hideTimer = window.setTimeout(() => setStatus(null), autoHideMs);
  } else {
    el.classList.remove('show');
  }
}
