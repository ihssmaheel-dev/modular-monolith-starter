FROM ghcr.io/astral-sh/uv:0.8.15 AS uv
FROM python:3.12.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/app/.venv/bin:/usr/local/bin:$PATH"

COPY --from=uv /uv /uvx /bin/
WORKDIR /app

COPY apps/intelligence/pyproject.toml apps/intelligence/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY apps/intelligence/src ./src
RUN uv sync --frozen --no-dev

RUN groupadd --system intelligence && useradd --system --gid intelligence --home-dir /app intelligence \
    && chown -R intelligence:intelligence /app
USER intelligence

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/internal/v1/health/live', timeout=3)"

CMD ["uvicorn", "intelligence.main:app", "--host", "0.0.0.0", "--port", "8080"]
