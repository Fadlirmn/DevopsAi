# FastAPI RAG service — internal only (never published by Compose).
FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app
COPY pyproject.toml ./
COPY src ./src
RUN pip install . && useradd --system --uid 10001 app \
    && mkdir -p /corpus && chown app /corpus  # seed corpus cache (named volume)
# scripts/ shipped so `docker compose run --rm rag python scripts/seed_dev.py` works.
COPY scripts ./scripts
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)" || exit 1
CMD ["uvicorn", "rag.app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-access-log"]
