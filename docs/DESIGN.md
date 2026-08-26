# diorama — design notes

Working design for the world-crafting tool. Nothing here is frozen; it's the map
of intent and the open questions.

## Vision

A tool for **crafting the world a story or game lives in** — the setting, not a
map of an already-built game. You lay down rooms, connect them, stage objects
inside them, and describe them, then **export to source code** (Beguile first).
The feel should be closer to arranging a tabletop diorama than filling in a form.

Explicit non-goal: this is **not** an automap/tracer. Tools that draw a map from a
running game or its internals already exist; diorama builds the world in the first
place.

## Interaction model

Designed touch-first for an iPad, with three primary gestures (see
`src/editor/gestures.ts`):

| Gesture | Action |
|---|---|
| **Tap** empty canvas | create a room where you tapped |
| **Drag** from room A to room B | create a connection (exit) between them |
| **Press-and-hold** on a room | dictate — speak a property (e.g. its description) |

Design intents to resolve:
- Editing an existing room (rename, add/remove properties, stage objects) — a panel? a radial menu on tap-hold of a room vs. empty space?
- Assigning a **direction** to an exit (N/S/E/…): infer from the relative geometry of the two rooms, or ask? Undirected exits are allowed in the model.
- Panning/zooming the canvas vs. the create/connect gestures (two-finger pan? a mode toggle?).
- Multi-select, delete, undo/redo.

## Data model

`src/model/world.ts` is the single source of truth: `World → Room[] → { properties, exits, things }`.
Plain, serializable data — round-trips to JSON for save/load, and decoupled from
both the UI and the exporters. The editor and dictation **mutate** it; exporters
**read** it.

## Export architecture

An `Exporter` (`src/export/exporter.ts`) turns a `World` into source text for one
language. Adding a target is just implementing the interface and registering it in
`src/export/index.ts` — the editor and model never learn about output formats.

- **Beguile** (`src/export/beguile.ts`) is the first target. ⚠ The exact room/exit
  API is still settling in the Beguile IF standard library (bglStdLib); the emitter
  is a clean first cut and the single place to update when that firms up.
- Future targets (Inform 6/7, TADS, Dialog, plain JSON) slot in the same way.

## PWA / iPad

- Installable via *Add to Home Screen* (manifest + service worker; `vite-plugin-pwa`).
- Full-bleed, `touch-action: none`, `viewport-fit=cover`, safe-area insets, offline
  once cached.
- Icons: `public/icons/diorama.svg` is a placeholder — add rasterized 192/512 PNGs
  for the widest install support.

## Dictation on iPad — the known risk

Press-and-hold dictation uses the Web Speech API (`src/speech/dictation.ts`), which
is solid in Chromium and desktop Safari but **historically unreliable on iOS Safari**
— and iPad is the primary target. `isSupported()` gates a fallback. Options to
evaluate, in rough order of effort:

1. **OS keyboard dictation** — focus a text field; the iOS keyboard's mic button
   does on-device STT for free. Loses the pure "hold-to-talk" gesture but always works.
2. **Cloud STT** — stream audio (MediaRecorder) to a speech API. Best quality/gesture
   fidelity; needs a network + a key + privacy consideration.
3. **On-device WASM STT** (e.g. a small Whisper build) — offline, private, heavier.

Decision deferred until we test SpeechRecognition on the actual target iPadOS.

## Roadmap (rough)

1. Editor polish: room editing, exit directions, pan/zoom, delete, undo.
2. Persistence: autosave to IndexedDB; import/export the world as JSON.
3. Dictation: validate on iPad; wire the chosen fallback.
4. Objects: stage `Thing`s in rooms with their own properties.
5. Beguile export: track bglStdLib's world model; add a copy/download/share action.
6. Additional exporters.
