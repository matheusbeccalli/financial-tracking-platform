#!/usr/bin/env bash
cd "$(dirname "$0")/backend"
.venv/bin/uvicorn app.main:app --port 8000 "$@"
