# diorama

**Craft the world your story plays in.**

diorama is a touch-first, installable web app (PWA) for *world crafting* — not
map-tracing. You build the environment a piece of interactive fiction takes place
in: rooms, the way they connect, the objects staged inside them, and the
properties that describe them. When you're done, diorama **exports the world to
source code** — [Beguile](https://github.com/onyxring/beguiler) first, with room
for other targets later.

It's called *diorama* because that's what you're making: a hand-built little world
you stage rooms and objects into. (And — for the marketing wink — **OR**, for
OnyxRing, sits right in the middle of it: di**OR**ama.)

## The interaction model (design target)

diorama is designed for a tablet — an iPad on the couch — with a direct, gestural feel:

- **Tap** empty space → create a room.
- **Swipe** from one room to another → connect them (an exit).
- **Press-and-hold** → **dictate** a property by voice (fill a description without typing).

Everything runs offline once installed to the home screen.

## Status

Early scaffold. The architecture and data model are in place; the editor, gesture
layer, dictation, and exporters are stubs to build out. See
[`docs/DESIGN.md`](docs/DESIGN.md) for the design and open questions.

## Architecture

```
src/
  model/    the world model — World, Room, Exit, Thing, Property (the single source of truth)
  editor/   the canvas node-graph UI + touch gesture recognition
  speech/   press-and-hold voice dictation (Web Speech API, with fallbacks)
  export/   pluggable code exporters — Exporter interface + a Beguile target
```

The **model is the hub**: the editor and dictation mutate it, and exporters read it.
Adding a new output language is just another `Exporter` — the editor never needs to know.

## Develop

```bash
npm install
npm run dev        # Vite dev server
npm run build      # production PWA build → dist/
```

Then open the dev URL on your iPad (same network) and *Add to Home Screen* to install it.

## License

MIT © 2024–2026 Jim Fisher (OnyxRing)
