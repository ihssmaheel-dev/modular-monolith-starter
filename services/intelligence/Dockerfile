# Multi-stage Dockerfile for Python Intelligence Service using Astral uv
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS builder

WORKDIR /app

ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy

# Install dependencies with lock caching
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --frozen --no-install-project --no-dev

# Final runtime image
FROM python:3.12-slim-bookworm

WORKDIR /app

# Install curl for container healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Create non-root system user and group (UID/GID 10001)
RUN groupadd --system --gid 10001 appgroup && \
    useradd --system --uid 10001 --gid appgroup --no-create-home appuser

# Copy virtual environment from builder
COPY --from=builder /app/.venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONPATH="/app/src"

# Copy application source code
COPY pyproject.toml README.md ./
COPY src/ ./src/

# Change ownership of app directory to appuser
RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 5157

# Container healthcheck instruction
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:5157/health/live || exit 1

# Run high-performance Rust ASGI server granian with multi-workers
CMD ["granian", "--interface", "asgi", "--host", "0.0.0.0", "--port", "5157", "--workers", "2", "--runtime-threads", "2", "src.main:app"]
