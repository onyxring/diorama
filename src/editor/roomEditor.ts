import type { Room } from '../model/world';
import { setProperty } from '../model/world';
import { startRecording, isRecordingSupported, type Recorder } from '../speech/recorder';
import { activeTranscriber } from '../speech/transcriber';

// A lightweight room editor: name + description, with hold-to-talk dictation.
//
// Dictation: press-and-hold the 🎤 to record, release to transcribe. Capture is
// MediaRecorder (works on iPad once mic permission is granted); transcription runs
// on-device via Whisper (see speech/). The model downloads on first use; typing
// always works. If mic capture isn't available at all, we fall back to focusing the
// field so the on-screen keyboard's own dictation mic can be used.
export function openRoomEditor(room: Room, onSave: () => void, autoDictate = false): void {
  const overlay = document.createElement('div');
  overlay.className = 'editor-overlay';
  overlay.innerHTML = `
    <div class="editor-panel">
      <label>Name<input class="e-name" type="text" /></label>
      <label>Description
        <div class="e-desc-row">
          <textarea class="e-desc" rows="4"></textarea>
          <button class="e-mic btn" type="button" title="Hold to talk">🎤</button>
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

  const appendText = (text: string) => {
    if (!text) return;
    descEl.value = (descEl.value ? descEl.value.replace(/\s+$/, '') + ' ' : '') + text;
  };

  // ── hold-to-talk: record on press, transcribe on release ────────────────────
  let recorder: Recorder | null = null;
  let busy = false;

  const startRec = async () => {
    if (busy || recorder) return;
    if (!isRecordingSupported()) {
      descEl.focus();                                  // last-ditch fallback: keyboard mic
      hintEl.textContent = 'Mic capture unavailable — use your keyboard’s 🎤, or type.';
      return;
    }
    const t = activeTranscriber();
    if (!t.isLoaded) void t.load((f, m) => { hintEl.textContent = `${m} ${Math.round(f * 100)}%`; });
    try {
      recorder = await startRecording();
      micEl.classList.add('live');
      hintEl.textContent = 'Listening… (release to transcribe)';
    } catch (err) {
      hintEl.textContent = 'Microphone blocked: ' + message(err);
      recorder = null;
    }
  };

  const stopRec = async () => {
    if (!recorder) return;
    const rec = recorder; recorder = null;
    micEl.classList.remove('live');
    busy = true;
    try {
      const pcm = await rec.stop();
      hintEl.textContent = activeTranscriber().isLoaded ? 'Transcribing…' : 'Loading speech model…';
      const text = await activeTranscriber().transcribe(pcm, (f, m) => {
        hintEl.textContent = f < 1 ? `${m} ${Math.round(f * 100)}%` : `${m}…`;
      });
      appendText(text);
      hintEl.textContent = text ? '' : 'Didn’t catch that — try again.';
    } catch (err) {
      hintEl.textContent = 'Transcription failed: ' + message(err);
    } finally {
      busy = false;
    }
  };

  micEl.addEventListener('pointerdown', (e) => { e.preventDefault(); void startRec(); });
  micEl.addEventListener('pointerup', () => void stopRec());
  micEl.addEventListener('pointercancel', () => void stopRec());
  micEl.addEventListener('pointerleave', () => { if (recorder) void stopRec(); });

  const save = () => {
    recorder?.cancel();
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
  if (autoDictate) hintEl.textContent = 'Hold 🎤 to talk, or just type.';
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
