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
The server makes that LLM call itself, on this machine, so the iPad still makes a single
request over wifi. Toggle it in **Settings → Description polish** (Local-server engine only).

It talks to any OpenAI-compatible endpoint. Defaults to [Ollama](https://ollama.com):

```bash
ollama serve            # exposes http://127.0.0.1:11434/v1
ollama pull llama3.2    # or qwen2.5, mistral, … any instruct model you like
```

The server auto-detects the first available model on startup. Override either default:

```bash
DIORAMA_LLM_URL=http://127.0.0.1:1234/v1 \   # e.g. LM Studio / llama.cpp instead
DIORAMA_LLM_MODEL=qwen2.5:7b-instruct \
  ./run.sh medium
```

If no LLM is reachable, polish requests simply return the raw transcription — dictation
never fails because the editor is down. Whisper transcription and the LLM are **separate**
(Ollama has no speech-to-text; faster-whisper handles the audio).

## Protocol

`POST /stt` with the body = raw little-endian **float32, 16 kHz, mono** PCM (exactly
what diorama captures). Returns `{"text": "..."}`. Silence/near-empty input returns `""`.
Add `?polish=1` to run the transcription through the local LLM before returning.
