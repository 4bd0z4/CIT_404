"""
CIT CTF — SQL Injection Challenge (sanitized runtime copy).

Intentionally vulnerable login (SQL injection) for the CTF.
The flag is read from the FLAG environment variable at startup — it is
NOT hardcoded here. The SQLite database is rebuilt in a writable temp
directory on each start so the container filesystem can stay read-only.
"""

import os
import sqlite3
import tempfile

from flask import Flask, render_template, request

app = Flask(__name__)

# Flag is injected via environment at runtime. Fallback is an obvious
# placeholder so a misconfigured deployment never leaks a real flag.
FLAG = os.environ.get("FLAG", "CIT{PLACEHOLDER_SET_FLAG_ENV}")

# Keep the DB in a writable temp dir so the root FS can be mounted read-only.
DB_PATH = os.path.join(tempfile.gettempdir(), "ctf.db")


def init_db():
    """Initialize the database with users and a hidden flag table."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("DROP TABLE IF EXISTS users")
    cursor.execute(
        """
        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'user'
        )
        """
    )

    cursor.execute(
        "INSERT INTO users (username, password, role) VALUES ('admin', 'Sup3rS3cur3P@ssw0rd!', 'admin')"
    )
    cursor.execute(
        "INSERT INTO users (username, password, role) VALUES ('guest', 'guest123', 'user')"
    )
    cursor.execute(
        "INSERT INTO users (username, password, role) VALUES ('john', 'password456', 'user')"
    )

    cursor.execute("DROP TABLE IF EXISTS flag")
    cursor.execute(
        """
        CREATE TABLE flag (
            id INTEGER PRIMARY KEY,
            value TEXT NOT NULL
        )
        """
    )
    cursor.execute("INSERT INTO flag (id, value) VALUES (1, ?)", (FLAG,))

    conn.commit()
    conn.close()


init_db()


@app.route("/")
def index():
    return render_template("login.html")


@app.route("/healthz")
def healthz():
    return "ok", 200


@app.route("/login", methods=["POST"])
def login():
    username = request.form.get("username", "")
    password = request.form.get("password", "")

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # *** VULNERABLE QUERY — intentionally injectable (this is the challenge) ***
    query = f"SELECT * FROM users WHERE username = '{username}' AND password = '{password}'"

    try:
        cursor.execute(query)
        result = cursor.fetchone()
    except Exception as e:
        conn.close()
        return render_template("login.html", error=f"SQL Error: {e}")

    conn.close()

    if result:
        if result[3] == "admin":
            return render_template("flag.html", flag=FLAG, user=result[1])
        return render_template(
            "login.html",
            error=f"Welcome {result[1]}, but you are not admin. Only admin can see the flag.",
        )
    return render_template("login.html", error="Invalid username or password.")


if __name__ == "__main__":
    # Local dev only. In the container this is served by gunicorn.
    app.run(debug=False, host="0.0.0.0", port=5000)
