"""
CIT CTF — Python eval-jail challenge (sanitized runtime copy).

Challenge logic only: given a line of input, enforce the blocklist and
evaluate it. Returns the flag (from the FLAG env var) when the expression
equals 1337. This module is driven by server.py over TCP — it does NOT
read stdin itself.

NOTE: this challenge is intentionally vulnerable (it calls eval on user
input). All real isolation is provided by the container sandbox: non-root,
read-only FS, dropped capabilities, no-new-privileges, strict resource/pid
limits, and an isolated network with no egress.
"""

import os
import re

# Flag is injected via environment at runtime. Fallback is an obvious
# placeholder so a misconfigured deployment never leaks a real flag.
FLAG = os.environ.get("FLAG", "CIT{PLACEHOLDER_SET_FLAG_ENV}")

# Characters / tokens the player is NOT allowed to use.
REGEXES = [
    r"\d\d",        # no two digits in a row
    r"\+",
    r"-",
    r"\*",
    r"/",
    r"<",
    r">",
    r"\^",
    r"v",
    r"&",
    r"\|",
    r"_",
    r"%",
    r"[\U000000ff-\U0010ffff]",  # block all non-ASCII
    r"exec",
    r"class",
]

BANNER = "Welcome to 3okacha , can you escape ?."
PROMPT = ">>> "


def evaluate(inp: str) -> str:
    """Apply the blocklist and evaluate. Returns the text to send back."""
    try:
        if any(re.search(r, inp) for r in REGEXES):
            return "Don't do bad stuff"

        if eval(inp) == 1337:  # noqa: S307 — intentional, this is the challenge
            return f"Congratulations! Here is your flag: {FLAG}"
        return "wrong"
    except Exception:
        return "Don't do bad stuff"
