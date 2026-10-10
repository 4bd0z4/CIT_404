"""
TCP front-end for the eval-jail challenge.

Each connection:
  * is handled in its own thread,
  * gets one banner + one prompt, reads a single line,
  * is evaluated in a forked child process with CPU + memory + wall-clock
    limits so a hostile payload cannot hog the (already locked-down)
    container,
  * is then closed.

The outer container provides the real security boundary. This process only
adds defense-in-depth so a single abusive connection cannot starve others.
"""

import os
import socket
import signal
import sys
import threading

import challenge

HOST = "0.0.0.0"
PORT = int(os.environ.get("PORT", "9000"))

# Per-request guard rails.
WALL_CLOCK_SECS = 5          # hard timeout for the eval child
CPU_SECS = 2                 # RLIMIT_CPU for the eval child
MEM_BYTES = 512 * 1024 * 1024  # RLIMIT_AS (virtual) for the eval child;
#                                container mem_limit caps real RSS tighter.
MAX_INPUT_BYTES = 4096       # reject absurdly long payloads

try:
    import resource
except ImportError:  # pragma: no cover - non-Unix fallback
    resource = None


def _apply_child_limits():
    if resource is None:
        return
    resource.setrlimit(resource.RLIMIT_CPU, (CPU_SECS, CPU_SECS))
    # Address-space cap. Keep generous enough that a legitimate CPython child
    # can start (CPython reserves a lot of virtual memory), but still bounded.
    try:
        resource.setrlimit(resource.RLIMIT_AS, (MEM_BYTES, MEM_BYTES))
    except (ValueError, OSError):
        pass
    # No core dumps.
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))


def evaluate_isolated(line: str) -> str:
    """Evaluate `line` in a forked, resource-limited child via a pipe."""
    if os.name != "posix" or not hasattr(os, "fork"):
        # Fallback: evaluate in-process (dev only).
        return challenge.evaluate(line)

    r_fd, w_fd = os.pipe()
    pid = os.fork()
    if pid == 0:  # child
        os.close(r_fd)
        try:
            _apply_child_limits()
            result = challenge.evaluate(line)
        except Exception:
            result = "Don't do bad stuff"
        try:
            os.write(w_fd, result.encode("utf-8", "replace")[:8192])
        finally:
            os.close(w_fd)
            os._exit(0)

    # parent
    os.close(w_fd)

    timed_out = {"v": False}

    def _kill():
        timed_out["v"] = True
        try:
            os.kill(pid, signal.SIGKILL)
        except ProcessLookupError:
            pass

    timer = threading.Timer(WALL_CLOCK_SECS, _kill)
    timer.start()
    chunks = []
    try:
        while True:
            data = os.read(r_fd, 4096)
            if not data:
                break
            chunks.append(data)
    finally:
        os.close(r_fd)
        os.waitpid(pid, 0)
        timer.cancel()

    if timed_out["v"]:
        return "Timed out."
    return b"".join(chunks).decode("utf-8", "replace") or "wrong"


def handle(conn: socket.socket, addr):
    try:
        conn.settimeout(30)
        conn.sendall((challenge.BANNER + "\n" + challenge.PROMPT).encode())

        buf = b""
        while b"\n" not in buf:
            data = conn.recv(1024)
            if not data:
                return
            buf += data
            if len(buf) > MAX_INPUT_BYTES:
                conn.sendall(b"Input too long.\n")
                return

        line = buf.split(b"\n", 1)[0].decode("utf-8", "replace").strip()
        result = evaluate_isolated(line)
        conn.sendall((result + "\n").encode("utf-8", "replace"))
    except (socket.timeout, ConnectionError, OSError):
        pass
    finally:
        try:
            conn.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass
        conn.close()


def main():
    # NOTE: do NOT set SIGCHLD to SIG_IGN here — we explicitly os.waitpid()
    # the eval child in evaluate_isolated(), and SIG_IGN would auto-reap it
    # out from under us.
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind((HOST, PORT))
    srv.listen(64)
    print(f"[*] eval-jail listening on {HOST}:{PORT}", flush=True)

    try:
        while True:
            conn, addr = srv.accept()
            t = threading.Thread(target=handle, args=(conn, addr), daemon=True)
            t.start()
    except KeyboardInterrupt:
        pass
    finally:
        srv.close()


if __name__ == "__main__":
    sys.exit(main())
