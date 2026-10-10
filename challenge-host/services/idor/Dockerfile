# CIT CTF — IDOR challenge image
FROM python:3.12-slim AS base

RUN groupadd --system --gid 10001 app \
    && useradd --system --uid 10001 --gid app --no-create-home --home-dir /app app

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy only runtime application files (code, templates, referenced static assets).
COPY app.py /app/app.py
COPY templates /app/templates
COPY static /app/static

USER 10001:10001

EXPOSE 5000

# Debug is OFF: gunicorn serves the WSGI app, no Flask reloader/debugger.
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--timeout", "30", "app:app"]
