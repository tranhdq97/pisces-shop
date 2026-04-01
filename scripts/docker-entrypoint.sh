#!/bin/sh
set -e
cd /app
export PYTHONPATH=/app
mkdir -p /app/data/about_media
alembic upgrade head
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
