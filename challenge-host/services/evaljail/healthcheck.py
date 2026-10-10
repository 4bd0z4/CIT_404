"""Tiny TCP health check: connect, read banner, exit 0 on success."""

import os
import socket
import sys

PORT = int(os.environ.get("PORT", "9000"))

try:
    with socket.create_connection(("127.0.0.1", PORT), timeout=3) as s:
        s.settimeout(3)
        data = s.recv(16)
        sys.exit(0 if data else 1)
except OSError:
    sys.exit(1)
