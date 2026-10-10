# CIT CTF — SQLi challenge image
FROM python:3.12-slim AS base

# Create an unprivileged user up front.
RUN groupadd --system --gid 10001 app \
    && useradd --system --uid 10001 --gid app --no-create-home --home-dir /app app

WORKDIR /app

# Install dependencies first for layer caching.
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy only runtime application files.
COPY app.py /app/app.py
COPY templates /app/templates

# Drop privileges.
USER 10001:10001

EXPOSE 5000

# gunicorn: 2 workers is plenty for a CTF challenge. Bind to all interfaces
# inside the container network only (never published directly to the host).
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--timeout", "30", "app:app"]
