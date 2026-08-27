#!/usr/bin/env bash
# Start diorama's local speech-to-text server. First run creates a venv, installs
# faster-whisper, and downloads the model (cached afterwards).
#
#   ./run.sh            # medium model (default), port 8760
#   ./run.sh large-v3   # most accurate (slower on CPU)
#   ./run.sh small      # faster, less accurate
set -e
cd "$(dirname "$0")"

if [ ! -d .venv ]; then
  echo "[diorama-stt] creating venv + installing (one-time)…"
  python3 -m venv .venv
  ./.venv/bin/pip install --quiet --upgrade pip
  ./.venv/bin/pip install --quiet -r requirements.txt
fi

exec ./.venv/bin/python stt_server.py "${1:-medium}" "${2:-8760}"
