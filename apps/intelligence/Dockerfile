FROM ghcr.io/astral-sh/uv:latest AS uv_bin
FROM python:3.12-slim

WORKDIR /app

# Copy uv binary from official image
COPY --from=uv_bin /uv /uvx /bin/

# Environment configurations
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_SYSTEM_PYTHON=1 \
    PORT=8000

# Install dependencies
COPY pyproject.toml uv.lock* /app/
RUN uv pip install --system -r pyproject.toml

# Copy application source
COPY src/ /app/src/

EXPOSE 8000

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
