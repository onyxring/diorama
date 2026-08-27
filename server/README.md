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

## Optional: description polish (local LLM)

For long-form dictation (room descriptions), diorama can ask for a light copy-edit —
quotation marks around dialogue and basic punctuation — **without changing your words**.
Toggle it in **Settings → Description polish** (Local-server engine only).

It runs **asynchronously**: transcription returns raw text instantly, then diorama sends
just that text to `POST /polish`, and the polished version swaps in when the LLM finishes.
So a slow model never blocks dictation — you keep building while it catches up.

It talks to any OpenAI-compatible endpoint. Defaults to [Ollama](https://ollama.com):

```bash
ollama serve            # exposes http://127.0.0.1:11434/v1
ollama pull qwen3:8b    # strong at "quote only the dialogue"; or gemma3, mistral, …
```

The server auto-detects a capable instruct model on startup (preferring qwen/llama/gemma,
skipping embedding models). Override either default:

```bash
DIORAMA_LLM_URL=http://127.0.0.1:1234/v1 \   # e.g. LM Studio / llama.cpp, or another host
DIORAMA_LLM_MODEL=qwen3:8b \
  ./run.sh medium
```

**Hardware note.** Quote-only-the-dialogue needs a mid-size model (qwen3:8b nails it; 1B
models just wrap the whole line in quotes). On Apple Silicon that's a few seconds; on a
CPU-only box (e.g. an Intel Mac) it's ~90 s — which is why polish is async. For snappy
polish, point `DIORAMA_LLM_URL` at an Apple-Silicon machine's Ollama on your LAN.

If no LLM is reachable, polish requests return the raw transcription — dictation never
fails because the editor is down. Whisper transcription and the LLM are **separate**
(Ollama has no speech-to-text; faster-whisper handles the audio).

## Protocol

`POST /stt` with the body = raw little-endian **float32, 16 kHz, mono** PCM (exactly
what diorama captures). Returns `{"text": "..."}`. Silence/near-empty input returns `""`.
Add `?polish=1` to run the transcription through the local LLM before returning.
