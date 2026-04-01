# syntax=docker/dockerfile:1
# Stage 1: build React SPA (served by FastAPI from frontend/dist)
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: API + static frontend
FROM python:3.11-slim-bookworm
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY alembic ./alembic
COPY alembic.ini .
COPY scripts ./scripts
RUN chmod +x /app/scripts/docker-entrypoint.sh

COPY --from=frontend-build /app/frontend/dist ./frontend/dist

ENV PYTHONPATH=/app
EXPOSE 8000
ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
