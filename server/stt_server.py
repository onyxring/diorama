#!/usr/bin/env python3
"""diorama local speech-to-text server.

Runs Whisper on this machine (Odin) via faster-whisper, so the iPad never has to.
Receives raw 16 kHz mono float32 PCM (exactly what diorama captures) as the POST body
and returns {"text": "..."}. No cloud, no key.

  ./run.sh                # small model, port 8760 (defaults)
  python3 stt_server.py medium 8760

diorama's Vite dev server proxies /stt → http://127.0.0.1:8760, so the browser only
talks to the same (https) origin; this server stays bound to localhost.
"""
import sys
import json
import numpy as np
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from faster_whisper import WhisperModel

MODEL = sys.argv[1] if len(sys.argv) > 1 else "small"
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8760

print(f"[diorama-stt] loading faster-whisper '{MODEL}' (cpu, int8)…", flush=True)
model = WhisperModel(MODEL, device="cpu", compute_type="int8")
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
        n = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(n) if n else b""
        text = ""
        try:
            if len(raw) >= 3200:                       # ignore < ~0.1 s of audio (stray taps)
                audio = np.frombuffer(raw, dtype=np.float32).copy()
                segments, _ = model.transcribe(audio, language="en", vad_filter=True)
                text = "".join(seg.text for seg in segments).strip()
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
