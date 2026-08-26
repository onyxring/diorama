import type { Room } from '../model/world';
import { setProperty } from '../model/world';
import { startDictation, isSupported, type DictationSession } from '../speech/dictation';

// A lightweight room editor: name + description, with dictation.
//
// Dictation strategy, by platform:
//   • Web Speech API present (Chromium, desktop Safari) → the 🎤 button does in-app
//     click-to-toggle dictation straight into the field.
//   • Not present (notably iOS Safari / iPad) → we focus the field so the on-screen
//     keyboard appears; its built-in dictation mic does on-device speech-to-text.
// Either way the user can also just type.
export function openRoomEditor(room: Room, onSave: () => void, autoDictate = false): void {
  const overlay = document.createElement('div');
  overlay.className = 'editor-overlay';
  overlay.innerHTML = `
    <div class="editor-panel">
      <label>Name<input class="e-name" type="text" /></label>
      <label>Description
        <div class="e-desc-row">
          <textarea class="e-desc" rows="4"></textarea>
          <button class="e-mic btn" type="button" title="Dictate">🎤</button>
        </div>
      </label>
      <div class="e-hint"></div>
      <div class="e-actions"><button class="e-done btn">Done</button></div>
    </div>`;
  document.body.appendChild(overlay);

  const nameEl = overlay.querySelector<HTMLInputElement>('.e-name')!;
  const descEl = overlay.querySelector<HTMLTextAreaElement>('.e-desc')!;
  const micEl = overlay.querySelector<HTMLButtonElement>('.e-mic')!;
  const hintEl = overlay.querySelector<HTMLDivElement>('.e-hint')!;
  const doneEl = overlay.querySelector<HTMLButtonElement>('.e-done')!;

  nameEl.value = room.name;
  descEl.value = String(room.properties.find(p => p.key === 'description')?.value ?? '');

  let session: DictationSession | null = null;
  const stopDictation = () => { session?.stop(); session = null; micEl.classList.remove('live'); };

  const toggleMic = () => {
    if (!isSupported()) {
      // iPad path: no Web Speech API → hand off to the keyboard's dictation mic.
      descEl.focus();
      hintEl.textContent = 'Tap the 🎤 on your keyboard to dictate — or just type.';
      return;
    }
    if (session) { stopDictation(); return; }
    const base = descEl.value ? descEl.value.replace(/\s+$/, '') + ' ' : '';
    micEl.classList.add('live');
    hintEl.textContent = 'Listening…';
    session = startDictation({
      onText: (t) => { descEl.value = base + t; },
      onEnd: () => { micEl.classList.remove('live'); hintEl.textContent = ''; session = null; },
      onError: (m) => { hintEl.textContent = m; micEl.classList.remove('live'); session = null; },
    });
    if (!session) micEl.classList.remove('live');
  };
  micEl.addEventListener('click', toggleMic);

  const save = () => {
    stopDictation();
    room.name = nameEl.value.trim() || room.name;
    const d = descEl.value.trim();
    if (d) setProperty(room, 'description', d);
    else room.properties = room.properties.filter(p => p.key !== 'description');
    overlay.remove();
    onSave();
  };
  doneEl.addEventListener('click', save);
  overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) save(); });

  // Focus synchronously (inside the originating gesture) so iOS shows the keyboard.
  descEl.focus();
  if (autoDictate) toggleMic();
}
