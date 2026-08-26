# diorama local speech-to-text server

Runs Whisper on this machine so dictation is accurate, private, and doesn't tax the
iPad. diorama sends the audio here and gets text back.

## Run

```bash
cd server
./run.sh           # small model (default), http://127.0.0.1:8760
./run.sh medium    # more accurate, slower on CPU
```

First run creates a `.venv`, installs `faster-whisper`, and downloads the model
(cached afterwards). Leave it running while you use diorama.

## How diorama reaches it

diorama's dev server proxies `/stt` → `http://127.0.0.1:8760` (see `vite.config.ts`),
so the browser only ever calls diorama's own https origin — no CORS, no mixed content,
and this server stays bound to localhost. In the app: **Settings → Local server (Odin)**.

## Protocol

`POST /stt` with the body = raw little-endian **float32, 16 kHz, mono** PCM (exactly
what diorama captures). Returns `{"text": "..."}`. Silence/near-empty input returns `""`.
