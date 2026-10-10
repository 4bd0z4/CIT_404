# CIT CTF — Python eval-jail TCP challenge image
# Pure stdlib: no third-party packages needed.
FROM python:3.12-slim AS base

RUN groupadd --system --gid 10001 app \
    && useradd --system --uid 10001 --gid app --no-create-home --home-dir /app app

WORKDIR /app

# Copy only runtime files.
COPY challenge.py /app/challenge.py
COPY server.py /app/server.py
COPY healthcheck.py /app/healthcheck.py

USER 10001:10001

EXPOSE 9000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD ["python", "/app/healthcheck.py"]

CMD ["python", "-u", "/app/server.py"]
