#!/usr/bin/env python3
"""diorama local speech-to-text (+ optional LLM polish) server.

Runs Whisper on this machine (Odin) via faster-whisper, so the iPad never has to.
Receives raw 16 kHz mono float32 PCM (exactly what diorama captures) as the POST body
and returns {"text": "..."}. No cloud, no key.

  ./run.sh                # small model, port 8760 (defaults)
  python3 stt_server.py medium 8760

Optional polish
---------------
For long-form dictation (room descriptions), diorama can ask for a light copy-edit —
adding quotation marks around spoken dialogue and fixing obvious punctuation — WITHOUT
changing the author's words. The client requests it with `?polish=1`, and this server
makes the LLM call locally (a same-machine hop to Ollama / LM Studio / any OpenAI-compatible
endpoint), so the iPad still makes a SINGLE network request over wifi.

  DIORAMA_LLM_URL    OpenAI-compatible base URL   (default http://127.0.0.1:11434/v1, Ollama)
  DIORAMA_LLM_MODEL  model name                   (default: auto-detected from the server)

If no LLM is reachable, polish is skipped and the raw transcription is returned — dictation
never fails because the editor is down.

diorama's Vite dev server proxies /stt → http://127.0.0.1:8760, so the browser only
talks to the same (https) origin; this server stays bound to localhost.
"""
import os
import sys
import json
import urllib.request
from urllib.parse import urlparse, parse_qs
import numpy as np
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from faster_whisper import WhisperModel

MODEL = sys.argv[1] if len(sys.argv) > 1 else "small"
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8760

LLM_BASE = os.environ.get("DIORAMA_LLM_URL", "http://127.0.0.1:11434/v1").rstrip("/")
LLM_MODEL = os.environ.get("DIORAMA_LLM_MODEL", "")

# Firm, conservative instructions: add quotes + punctuation, never touch the wording.
POLISH_SYSTEM = (
    "You are a careful copy editor for interactive-fiction room descriptions. "
    "The text came from speech-to-text, so it lacks punctuation and quotation marks. "
    "Your ONLY job is to add quotation marks around spoken dialogue and fix obvious "
    "punctuation and capitalization. Do NOT change, add, remove, reorder, or paraphrase "
    "any words. Do NOT add commentary, labels, or markdown. Return only the corrected text."
)


def _http_json(url, payload=None, timeout=60):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        url, data=data,
        headers={"content-type": "application/json"},
        method="POST" if data is not None else "GET",
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def detect_model():
    """Pick a model if none was configured — whatever the LLM server has loaded first."""
    global LLM_MODEL
    if LLM_MODEL:
        return LLM_MODEL
    try:
        d = _http_json(LLM_BASE + "/models", timeout=3)
        ids = [m.get("id") for m in d.get("data", []) if m.get("id")]
        LLM_MODEL = ids[0] if ids else ""
    except Exception:
        LLM_MODEL = ""
    return LLM_MODEL


def _strip_wrapping(s):
    s = s.strip()
    if s.startswith("```"):                       # drop an accidental code fence
        s = s.strip("`").strip()
        if "\n" in s:                             # ```lang\n...\n```
            first, rest = s.split("\n", 1)
            if len(first) <= 12 and " " not in first:
                s = rest.strip()
    return s


def polish_text(text):
    if not text or not LLM_MODEL:
        return text
    try:
        d = _http_json(LLM_BASE + "/chat/completions", {
            "model": LLM_MODEL,
            "messages": [
                {"role": "system", "content": POLISH_SYSTEM},
                {"role": "user", "content": text},
            ],
            "temperature": 0,
            "stream": False,
        }, timeout=60)
        out = _strip_wrapping(d.get("choices", [{}])[0].get("message", {}).get("content") or "")
        return out or text
    except Exception as err:
        print(f"[diorama-stt] polish error: {err}", flush=True)
        return text


print(f"[diorama-stt] loading faster-whisper '{MODEL}' (cpu, int8)…", flush=True)
model = WhisperModel(MODEL, device="cpu", compute_type="int8")
detect_model()
if LLM_MODEL:
    print(f"[diorama-stt] polish LLM: {LLM_MODEL} @ {LLM_BASE}", flush=True)
else:
    print(f"[diorama-stt] polish LLM: none reachable at {LLM_BASE} (polish requests return raw text)", flush=True)
print(f"[diorama-stt] ready on http://127.0.0.1:{PORT}", flush=True)


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "content-type")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        want_polish = parse_qs(urlparse(self.path).query).get("polish", ["0"])[0] in ("1", "true", "yes")
        n = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(n) if n else b""
        text = ""
        try:
            if len(raw) >= 3200:                       # ignore < ~0.1 s of audio (stray taps)
                audio = np.frombuffer(raw, dtype=np.float32).copy()
                segments, _ = model.transcribe(audio, language="en", vad_filter=True)
                text = "".join(seg.text for seg in segments).strip()
                if text and want_polish:
                    text = polish_text(text)
        except Exception as err:                        # never let one bad request kill the server
            print(f"[diorama-stt] transcribe error: {err}", flush=True)
        body = json.dumps({"text": text}).encode()
        self.send_response(200)
        self._cors()
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass  # quiet


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
