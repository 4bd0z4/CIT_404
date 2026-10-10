"""
CIT Club IDOR Challenge — Flask Server (sanitized runtime copy).

Intentionally vulnerable to IDOR: /?id=0 and /api/member?id=0 expose the
hidden president profile + flag. The flag is read from the FLAG environment
variable at runtime — it is NOT hardcoded here. Debug mode is OFF.
"""

import os

from flask import Flask, render_template, request, jsonify

app = Flask(__name__, static_folder="static", template_folder="templates")

MEMBERS = {
    1: {"name": "FAOUZI Ilyas", "role": "Vice-Président — Affaires Internes"},
    2: {"name": "GUERGARI Mohamed", "role": "Vice-Président — Affaires Externes"},
    3: {"name": "REGRAGUI Walid", "role": "Trésorier"},
    4: {"name": "BOUKALLOUCH Mehdi", "role": "Secrétaire Général"},
    5: {"name": "AIT MELLOUK Abdelghafour", "role": "Chef de Cellule Technique"},
    6: {"name": "MAMOUH Bilal", "role": "Chef de Cellule Conférences"},
    7: {"name": "ACHKAF Achraf", "role": "Chef de Cellule Sponsoring"},
}

# Flag is injected via environment at runtime. Fallback is an obvious
# placeholder so a misconfigured deployment never leaks a real flag.
FLAG = os.environ.get("FLAG", "CIT{PLACEHOLDER_SET_FLAG_ENV}")

PRESIDENT_NAME = "BEN MESBAH Yassine"
PRESIDENT_ROLE = "Président du Club"


@app.route("/")
def index():
    member_id = request.args.get("id")
    if member_id is None:
        return render_template("index.html")

    try:
        member_id = int(member_id)
    except (ValueError, TypeError):
        return render_template("profile.html", error=True, message="ID de membre invalide.")

    if member_id == 0:
        return render_template(
            "profile.html", flag=True, flag_value=FLAG, member_id=member_id
        )

    if member_id in MEMBERS:
        return render_template("profile.html", member=MEMBERS[member_id], member_id=member_id)

    return (
        render_template("profile.html", error=True, message=f"Membre ID {member_id} introuvable."),
        404,
    )


@app.route("/healthz")
def healthz():
    return "ok", 200


@app.route("/api/member")
def api_member():
    member_id = request.args.get("id")
    try:
        member_id = int(member_id)
    except (ValueError, TypeError):
        return jsonify(success=False, error="ID invalide"), 400

    if member_id == 0:
        return jsonify(
            success=True,
            is_flag=True,
            name=PRESIDENT_NAME,
            role=PRESIDENT_ROLE,
            flag=FLAG,
        )

    if member_id in MEMBERS:
        return jsonify(success=True, is_flag=False, **MEMBERS[member_id])

    return jsonify(success=False, error="Introuvable"), 404


if __name__ == "__main__":
    # Local dev only. In the container this is served by gunicorn.
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
