import { getSettings, saveSettings, type Engine } from '../settings';

// Settings sheet: choose the speech-to-text engine and store cloud API keys (kept in
// localStorage on this device only).
const ENGINES: { id: Engine; label: string; note: string }[] = [
  { id: 'ondevice', label: 'On-device (Whisper tiny)', note: 'Offline, private. Small model — lower accuracy; heavy on iPad memory.' },
  { id: 'local', label: 'Local server (Odin)', note: 'Runs Whisper on your Mac. Accurate, private, no key. Needs server/run.sh going + same network.' },
  { id: 'groq', label: 'Groq (cloud)', note: 'Fast, accurate whisper-large-v3-turbo. Needs a Groq API key + network.' },
  { id: 'openai', label: 'OpenAI (cloud)', note: 'Accurate. Needs an OpenAI API key + network.' },
];

export function openSettings(): void {
  const s = getSettings();
  const overlay = document.createElement('div');
  overlay.className = 'sheet settings-sheet';
  overlay.innerHTML = `
    <div class="settings-panel">
      <h2>Speech-to-text</h2>
      <div class="engine-list">
        ${ENGINES.map(e => `
          <label class="engine ${s.engine === e.id ? 'on' : ''}">
            <input type="radio" name="engine" value="${e.id}" ${s.engine === e.id ? 'checked' : ''}/>
            <span class="engine-label">${e.label}</span>
            <span class="engine-note">${e.note}</span>
          </label>`).join('')}
      </div>
      <label class="field-label">Groq API key
        <input class="field-input" id="groqKey" type="password" placeholder="gsk_…" value="${esc(s.groqKey)}"/>
      </label>
      <label class="field-label">OpenAI API key
        <input class="field-input" id="openaiKey" type="password" placeholder="sk-…" value="${esc(s.openaiKey)}"/>
      </label>
      <h2>Description polish</h2>
      <label class="engine ${s.polish ? 'on' : ''}" id="polish-row">
        <input type="checkbox" id="polish" ${s.polish ? 'checked' : ''}/>
        <span class="engine-label">Polish long descriptions</span>
        <span class="engine-note">Adds quotation marks and punctuation to dictated descriptions with a local LLM, without changing your words. Runs on the Local-server engine (Odin) only; names are never altered.</span>
      </label>
      <div class="settings-actions"><button class="btn" id="settings-done">Done</button></div>
    </div>`;
  document.body.appendChild(overlay);

  overlay.querySelectorAll<HTMLInputElement>('input[name="engine"]').forEach((r) =>
    r.addEventListener('change', () => {
      saveSettings({ engine: r.value as Engine });
      overlay.querySelectorAll('.engine').forEach((el) => el.classList.toggle('on', el.contains(r)));
    }));
  overlay.querySelector<HTMLInputElement>('#groqKey')!.addEventListener('input', (e) =>
    saveSettings({ groqKey: (e.target as HTMLInputElement).value.trim() }));
  overlay.querySelector<HTMLInputElement>('#openaiKey')!.addEventListener('input', (e) =>
    saveSettings({ openaiKey: (e.target as HTMLInputElement).value.trim() }));
  overlay.querySelector<HTMLInputElement>('#polish')!.addEventListener('change', (e) => {
    const on = (e.target as HTMLInputElement).checked;
    saveSettings({ polish: on });
    overlay.querySelector('#polish-row')!.classList.toggle('on', on);
  });

  const close = () => overlay.remove();
  overlay.querySelector('#settings-done')!.addEventListener('click', close);
  overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) close(); });
}

function esc(s: string): string {
  return s.replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
