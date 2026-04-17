#!/bin/bash
set -e

if [ "${USE_DOCKER_EXEC}" = "true" ]; then
    echo "Starting watchdog for dafny-worker..."
    python /app/watchdog.py &
fi

poetry run uvicorn main:app --host 0.0.0.0 --port 8080