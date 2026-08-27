# diorama local speech-to-text server

Runs Whisper on this machine so dictation is accurate, private, and doesn't tax the
iPad. diorama sends the audio here and gets text back.

## Run

```bash
cd server
./run.sh           # medium model (default), http://127.0.0.1:8760
./run.sh large-v3  # most accurate, slower on CPU
./run.sh small     # faster, less accurate
```

First run creates a `.venv`, installs `faster-whisper`, and downloads the model
(cached afterwards). Leave it running while you use diorama.

### Accuracy

Short, context-free clips (a one-word room name) are the hardest case — a small model will
guess a more common similar-sounding word ("foyer" → "fire", "dining room" → "Daniel"). Two
things counter that, both on by default:

- **Domain priming** — the decoder is seeded with room vocabulary (`STT_PROMPT`), so it
  favors "foyer", "parlor", "cellar" over homophones. Override with `DIORAMA_STT_PROMPT`
  for a different setting/genre.
- **A bigger model** — the default is now `medium`; use `large-v3` if your box can spare the
  time. Each utterance is decoded independently (`condition_on_previous_text=False`) so names
  don't bleed into each other.

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
ollama serve                    # exposes http://127.0.0.1:11434/v1
ollama pull qwen2.5:7b-instruct # recommended — see "Which model" below
```

The server auto-detects a capable model on startup — preferring **non-reasoning** instruct
families (qwen2.5 / llama / gemma) at ~7-8B, and skipping embedding + reasoning models.
Override either default:

```bash
DIORAMA_LLM_URL=http://127.0.0.1:1234/v1 \   # e.g. LM Studio / llama.cpp, or another host
DIORAMA_LLM_MODEL=qwen2.5:7b-instruct \
  ./run.sh medium
```

### Which model

Benchmarked on a CPU-only box (~5-9 tok/s), polishing room descriptions:

| Model | Speed | Quality |
|-------|-------|---------|
| **qwen2.5:7b-instruct** | **~4 s** | ✅ Quotes only the dialogue, keeps words verbatim — the sweet spot |
| qwen3:8b | ~90 s | ✅ Faithful, but it's a reasoning model → burns minutes "thinking" on CPU |
| qwen3:4b | timeouts | ❌ Reasoning can't be disabled reliably here; rambles past any timeout |
| qwen2.5:3b-instruct | ~1.5 s | ⚠️ Fast but wraps the whole line in quotes and can drop words |
| llama3.2:1b | ~1 s | ❌ Quotes the entire description indiscriminately |

Takeaway: pick a **non-reasoning** instruct model (avoid qwen3/“thinking” models — `/no_think`
is unreliable), around 7-8B. On Apple Silicon even the 8B is a few seconds; on CPU stick to
7B. If your only fast box is elsewhere on the LAN, point `DIORAMA_LLM_URL` at it.

If no LLM is reachable, polish requests return the raw transcription — dictation never
fails because the editor is down. Whisper transcription and the LLM are **separate**
(Ollama has no speech-to-text; faster-whisper handles the audio).

## Protocol

`POST /stt` with the body = raw little-endian **float32, 16 kHz, mono** PCM (exactly
what diorama captures). Returns `{"text": "..."}`. Silence/near-empty input returns `""`.
Add `?polish=1` to run the transcription through the local LLM before returning.
