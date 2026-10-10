# CIT:404 — CTF Packaging Notes

Scope: how organizer source artifacts in the private `cit-challs` repository map to
sanitized player-facing artifacts, and which external/service URL inputs are still
missing before launch.

This document contains **no flags, keys, solutions, hashes, passwords, private URLs,
or organizer notes**. The public catalog it accompanies is
`Backend/data/challenges.json`.

## Principles

- The private author repository (`cit-challs`) is the source of truth for solutions
  and must never be distributed or deployed as the participant package.
- Player artifacts are stripped of every `Solution:` and plaintext `flag:` line,
  bundled `venv/` directories, and any file containing the answer.
- Flags are kept out of this catalog entirely. They enter the platform only through
  the private server-side bcrypt flag workflow and are stored as hashes in the game DB.
- Resource URLs that are not yet publicly known are `null` placeholders in the
  catalog and must be filled in from the hosting/secret manager at packaging time.

## Resource type model

| Type | Meaning | Packaging action |
|---|---|---|
| EXTERNAL | Link to an external platform/site | Publish the public link; verify it is reachable without organizer login. |
| DOWNLOAD | Sanitized artifact the player downloads | Export the single artifact file; strip sidecar solution/prompt files; verify MIME type. |
| SERVICE | Live hosted HTTP/TCP service | Deploy isolated/hardened container; publish only the endpoint URL/host:port. |
| STATIC | Fully described in text | No artifact; the catalog description is the whole challenge. |

## Competitive Programming (CP A–G)

All seven CP problems are hosted and graded on HackerRank. Players solve on HackerRank,
pass all hidden tests, copy the revealed completion key, and submit it back in CIT:404.

| Catalog code | Source artifact | Sanitized player artifact | Resource type |
|---|---|---|---|
| CP-A | HackerRank problem A (external) + private completion key | External button to the HackerRank contest | EXTERNAL |
| CP-B | HackerRank problem B (external) + private completion key | External button to the HackerRank contest | EXTERNAL |
| CP-C | HackerRank problem C (external) + private completion key | External button to the HackerRank contest | EXTERNAL |
| CP-D | HackerRank problem D (external) + private completion key | External button to the HackerRank contest | EXTERNAL |
| CP-E | HackerRank problem E (external) + private completion key | External button to the HackerRank contest | EXTERNAL |
| CP-F | HackerRank problem F (external) + private completion key | External button to the HackerRank contest | EXTERNAL |
| CP-G | HackerRank problem G (external) + private completion key | External button to the HackerRank contest | EXTERNAL |

- Public resource URL for all seven: `https://www.hackerrank.com/cit-the-moon` (known).
- Completion keys are **private inputs**, never in this catalog or any player artifact.

## CTF challenges (15)

Source paths below are directories/files inside the private `cit-challs` repository.
The "sanitized player artifact" column describes what a participant receives; the
`Solution:` and plaintext `flag:` lines present in every source prompt are removed.

| Catalog code | Subcategory | Source artifact | Sanitized player artifact | Resource type |
|---|---|---|---|---|
| CTF-CR-01 | Crypto | `crypto/challenge 1` (prompt + encoded sample + solution/flag lines) | Catalog description with the public encoded sample only | STATIC |
| CTF-CR-02 | Crypto | `crypto/challenge 2` (prompt + ciphertext + key hint + solution/flag lines) | Catalog description with the public ciphertext only | STATIC |
| CTF-CR-03 | Crypto | `crypto/challenge 3` (prompt + binary sample + solution/flag lines) | Catalog description with the public binary stream only | STATIC |
| CTF-OS-01 | OSINT | `OSINT/challenge1.txt` (prompt + external link + solution/flag lines) | Catalog description + public external link | EXTERNAL |
| CTF-OS-02 | OSINT | `OSINT/challenge2.txt` (prompt + solution/flag lines) | Catalog description only (map investigation) | STATIC |
| CTF-OS-03 | OSINT | `OSINT/challenge3.txt` (prompt + solution/flag lines) | Catalog description only (public social profile) | STATIC |
| CTF-MI-01 | Misc | `misc/challenge 1` (prompt + solution/flag lines) | Catalog description + link to a dedicated sanitized challenge repo (NOT the answer repo) | EXTERNAL |
| CTF-MI-02 | Misc | `misc/challenge 2 /challenge.py` + `challenge.txt` (source + TCP endpoint + solution/flag lines) | Hardened isolated TCP service; players get the endpoint only | SERVICE |
| CTF-MI-03 | Misc | `misc/challenge 3/challenge.txt` (prompt + solution/flag lines) | Catalog description only (public profile investigation) | STATIC |
| CTF-MI-04 | Misc | `misc/challenge 4/server.log` + `challenge.txt` (log + solution/flag lines) | `server.log` download only | DOWNLOAD |
| CTF-ST-01 | Steganography | `stegno/challenge 1/Bizu 9re3.jpg` + `challenge1.txt` (image + solution/flag lines) | Image file download only (preserve metadata) | DOWNLOAD |
| CTF-ST-02 | Steganography | `stegno/challenge2/challenge.wav` + `challenge 2.txt` (audio + solution/flag lines) | WAV download only (no transcoding) | DOWNLOAD |
| CTF-WE-01 | Web | `web/challenge 1/sqli_challenge` (Flask app + db + README/solution + bundled venv) | Containerized isolated service; endpoint only; venv and solution README removed | SERVICE |
| CTF-WE-02 | Web | `web/challenge 2/idor_challenge` (Flask app + README/solution + bundled venv) | Containerized isolated service (debug off); endpoint only; venv and solution removed | SERVICE |
| CTF-WE-03 | Web | `web/challenge 3/challenge` (static HTML/CSS/JS) + `dev_tools.txt` (solution/flag lines) | Static site deploy (index.html/style.css/app.js); decoys preserved | STATIC |

### Sanitization checklist applied per challenge

- Remove every `Solution:` / `the flag is` / `the flag will be` line.
- Remove every plaintext `flag:` / `CIT{...}` / `CTF{...}` line.
- Remove embedded answer hints that reveal the method's secret (e.g. the Vigenère key).
- Remove bundled `venv/` directories from the two Flask web services; replace with
  pinned `requirements.txt`.
- Remove the solution `README.md` files from the SQLi and IDOR web services.
- For DOWNLOAD items, export only the single intended artifact (no sidecar prompt
  files containing answers).

## Missing external / service URL inputs (must be supplied before launch)

The following catalog entries have `resource_url: null` and need a value from the
hosting/secret manager or the external target owner. None of these are stored in the
catalog as secrets; they are public endpoints to be published once provisioned.

| Catalog code | Resource type | Missing input |
|---|---|---|
| CTF-MI-01 | EXTERNAL | URL of the dedicated **sanitized** Git challenge repository (must not be the answer repo). |
| CTF-MI-02 | SERVICE | TCP endpoint (host:port) of the hardened, isolated Python eval-jail service. |
| CTF-MI-04 | DOWNLOAD | Download URL for `server.log` (S3/CloudFront or isolated host). |
| CTF-ST-01 | DOWNLOAD | Download URL for the sanitized image artifact. |
| CTF-ST-02 | DOWNLOAD | Download URL for the sanitized WAV artifact. |
| CTF-WE-01 | SERVICE | HTTP endpoint of the containerized SQL-injection service. |
| CTF-WE-02 | SERVICE | HTTP endpoint of the containerized IDOR service. |

Entries left as STATIC (CTF-CR-01/02/03, CTF-OS-02, CTF-OS-03, CTF-MI-03, CTF-WE-03)
need no URL; their public description is the complete player artifact. CTF-OS-01 and
all CP entries already have known public URLs.

### Verification still required for known URLs

- CTF-OS-01 (`https://cit-challenges.github.io/wayback-machine-challenge/`): confirm
  the GitHub Pages target and its historical snapshot remain available for the event.
- CP-A…CP-G (`https://www.hackerrank.com/cit-the-moon`): confirm the contest is open
  and all seven problems are visible to participants.
