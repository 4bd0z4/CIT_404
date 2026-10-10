# CIT CTF — Challenge Host

Isolated Docker Compose stack for three CTF challenges. This stack is
**completely separate** from the CIT_404 core platform (Railway/Vercel) and
must run on its own EC2 host. It contains no core DB/app credentials and no
real flags — flags are injected at runtime via environment variables.

## Services

| Challenge | Type | Exposure | Isolation highlights |
|-----------|------|----------|----------------------|
| `sqli` | Flask (gunicorn) | internal only, via Caddy | non-root, read-only FS, caps dropped |
| `idor` | Flask (gunicorn), **debug OFF** | internal only, via Caddy | non-root, read-only FS, caps dropped |
| `evaljail` | raw TCP (`:9000`) | published to host | **strongest**: isolated no-egress network, per-eval forked child with CPU/mem/PID limits |
| `caddy` | reverse proxy | host `:80`/`:443` | only HTTP entry point; auto-HTTPS |

### Shared hardening (all challenge services)
- `user` non-root (uid/gid 10001)
- `no-new-privileges:true`
- `cap_drop: ALL` (Caddy re-adds only `NET_BIND_SERVICE`)
- `read_only: true` root filesystem; writable `tmpfs` only where required
- `mem_limit` / `cpus` / `pids_limit` set per service
- swap disabled (`memswap_limit == mem_limit`)
- bounded JSON log files (10 MB × 3)
- separate bridge networks per trust boundary; `cit-jail` is `internal: true` (no egress)

The eval-jail is intentionally vulnerable (it calls `eval` on attacker input).
Its security comes entirely from the sandbox: no-egress network, read-only FS,
dropped capabilities, no-new-privileges, tight PID/CPU/memory caps, plus a
forked, resource-limited child process per evaluation.

## Local usage

```bash
cd challenge-host
cp .env.example .env         # then edit .env with REAL flags (never commit it)
docker compose config        # validate
docker compose build
docker compose up -d
docker compose ps            # check health
```

- SQLi / IDOR are reachable through Caddy only (set `CHALLENGE_DOMAIN`, or test
  with `curl -H "Host: sqli.chall.example.com" http://localhost`).
- eval-jail: `nc <host> 9000`.

---

## EC2 deployment

### 1. Instance
- AMI: Amazon Linux 2023 (or Ubuntu 22.04+). `t3.small` is enough for 51
  operators / 17 teams; scale up if needed.
- Install Docker Engine + Compose plugin:
  ```bash
  # Amazon Linux 2023
  sudo dnf install -y docker
  sudo systemctl enable --now docker
  sudo usermod -aG docker ec2-user
  # Compose plugin
  sudo dnf install -y docker-compose-plugin   # or install the binary plugin
  ```
- Copy this `challenge-host/` directory to the instance (e.g. `scp -r`), then
  create `.env` on the host with the real flags. Do **not** bake flags into
  images or commit `.env`.

### 2. Elastic IP
- Allocate an Elastic IP and associate it with the instance so the public IP
  survives reboots. Point DNS at this EIP (next step).

### 3. DNS
Create A records pointing at the Elastic IP:

| Record | Type | Value |
|--------|------|-------|
| `sqli.chall.example.com` | A | `<ELASTIC_IP>` |
| `idor.chall.example.com` | A | `<ELASTIC_IP>` |
| `chall.example.com` (optional, for eval-jail host) | A | `<ELASTIC_IP>` |

Set `CHALLENGE_DOMAIN=chall.example.com` and `CADDY_ACME_EMAIL=you@domain` in
`.env`. Caddy derives `sqli.` / `idor.` subdomains from `CHALLENGE_DOMAIN`.

### 4. Security Group (inbound rules)

| Port | Protocol | Source | Purpose |
|------|----------|--------|---------|
| 22 | TCP | **your admin IP /32 only** | SSH |
| 80 | TCP | `0.0.0.0/0` | HTTP + Let's Encrypt ACME challenge (required for cert issuance) |
| 443 | TCP | `0.0.0.0/0` | HTTPS (SQLi + IDOR via Caddy) |
| 9000 | TCP | participant CIDR (or `0.0.0.0/0` if public) | eval-jail raw TCP challenge |

Outbound: default allow-all is fine (needed for ACME + image pulls). Lock down
further if your policy requires it, but keep 443 egress open for ACME.

Notes:
- Port 80 must stay open or Let's Encrypt HTTP-01 validation fails. Caddy
  redirects 80→443 automatically after certs are issued.
- Restrict 9000 to the participant network if the event is private.
- Restrict 22 to your bastion/admin IP — never `0.0.0.0/0`.

### 5. HTTPS
Caddy auto-provisions and renews Let's Encrypt certificates for the
`sqli.` and `idor.` subdomains once:
1. DNS A records resolve to the Elastic IP, and
2. SG ports 80 + 443 are open.

Certs/keys persist in the `caddy_data` volume across restarts. For load
testing, uncomment the staging ACME CA line in `caddy/Caddyfile` to avoid
Let's Encrypt rate limits, then switch back for production.

### 6. eval-jail TCP port
The eval-jail is a raw TCP service, so it is **not** behind Caddy/HTTPS. It is
published on host port `9000` and reached with `nc <host-or-domain> 9000`.
Expose it via the Elastic IP (and optionally the `chall.example.com` A record).
Keep its container on the `cit-jail` internal network so it has no outbound
internet access.

---

## What was intentionally NOT copied
- READMEs, write-ups, and solution notes
- Virtualenvs (`venv/`)
- Prebuilt `ctf.db` (the SQLi app rebuilds it at startup in `/tmp`)
- Unused static media (only template-referenced assets were copied for IDOR)
- Real flag values and any core DB/app credentials or public IPs
