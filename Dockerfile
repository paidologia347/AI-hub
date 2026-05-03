FROM python:3.12-slim

WORKDIR /app

# Install build tools for any wheels that need compilation, then clean up.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy project metadata first to leverage Docker layer caching when source
# changes but deps don't.
COPY pyproject.toml ./
COPY README.md ./

# Install the package + deps.
COPY main.py ./
COPY static ./static
RUN pip install --no-cache-dir -e .

EXPOSE 8000

# `--proxy-headers` is required when running behind a reverse proxy (Render,
# Fly.io, Cloudflare Tunnel) so SSE / streaming responses work correctly.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers"]
