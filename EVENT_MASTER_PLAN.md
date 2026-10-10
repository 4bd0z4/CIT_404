# CIT:404 — Event Master Plan

**Status:** planning baseline after reviewing the current platform, both DCR PDFs, the full DCR handoff pack, `answer_hashes.json`, the `cit-challs` repository, and the seven external HackerRank CP completion keys supplied privately.

**Rule:** this document contains no flags, proof keys, answers, hashes, passwords, peppers, or database URLs. It may be kept in the project, but it must not be committed until reviewed.

## 1. Confirmed event shape

The participant-facing Challenges phase contains three main sections:

1. **CP — Competitive Programming:** 7 HackerRank problems. HackerRank executes and grades code. When all tests pass, it reveals a proof key. The player submits that key to CIT:404 as a normal CP flag. No Judge0 and no code execution inside CIT:404.
2. **CTF — Cybersecurity challenges:** 15 supplied challenges across Crypto, OSINT, Misc, Steganography, and Web. Some are prompts/downloads, some depend on external services/accounts, and three require live services. A future super-hard CTF is planned as challenge 16.
3. **DATA — DCR (Data Core Retrieval):** 15 SQL investigation missions over a separate read-only PostgreSQL database. Players run SQL to inspect results, then submit a separate short answer. The SQL itself is never scored.

Total known challenge units today: **37** (7 CP + 15 CTF + 15 DCR), separate from Field Missions and Endgame. One future super-hard CP and one future super-hard CTF are planned, bringing the eventual total to **39**.

Teams are confirmed at exactly **3 operators each**. Create **17 team accounts**: 15 planned teams plus 2 reserve teams, for a maximum of **51 active operators**. The earlier 100-player figure is therefore attendance/headroom, not simultaneous authenticated operators.

## 2. Inputs received and reviewed

- `/home/abdelgha44/Downloads/guide technical.pdf` — DCR technical-lead guide.
- `/home/abdelgha44/Downloads/DCR guide particpant.pdf` — DCR participant guide.
- `/home/abdelgha44/Downloads/answer_hashes.json` — 15 DCR answer hashes, M01–M15. Do not copy into Git.
- `/home/abdelgha44/Downloads/platform_handoff (3).zip` — DCR backend, SQL, mission data, scripts, UI spec, and integration instructions.
- `/home/abdelgha44/Desktop/cit-challs` — 15 current CTF challenges and artifacts; a future super-hard CTF will become challenge 16.
- Seven HackerRank CP completion proof keys were supplied in chat. Do not copy them into Git or this plan.
- Current app: `/home/abdelgha44/Desktop/CIT_404`.

Judge0 and Monaco work has been fully removed. The current Git working tree contains only untracked planning/documentation work (`ARCHITECTURE_REVIEW.md`, `event-guide/`, and this plan).

## 3. Critical findings before implementation

### 3.1 Secrets and challenge leakage — launch blocker

- GitHub confirms `4bd0z4/cit-challs` is **PRIVATE**. Its plaintext flags and solution text are visible only to authorized collaborators, which is acceptable for the organizer source repository.
- That private repository must still never be distributed or deployed as the participant package; prepare sanitized player artifacts without solution/flag files.
- The seven currently supplied CP proof keys are the HackerRank completion keys. Because they appeared in this conversation, rotating them before launch is the safest option, but they are not present in Git or the platform source.
- Existing deployed admin/team credentials and seeded flags were exposed during deployment testing and are test-only.
- DCR answer hashes must remain outside Git; they only work with the exact matching `ANSWER_PEPPER`.

**Required response:** keep the author repository private; create sanitized player packages in a separate clean repository/bucket; rotate the CP proof keys and all deployed test credentials before launch; never publish organizer answer files.

### 3.2 CTF challenges are not one deployment type

**Static/prompt/download challenges:** all Crypto, all OSINT prompts, Misc Git, Misc log analysis, both Steganography challenges, and the static DevTools web challenge. These should be served as sanitized descriptions and/or downloadable artifacts.

**Live services requiring isolation:**

- SQL injection Flask service.
- IDOR Flask service.
- Python `eval` jail exposed over TCP.

These intentionally vulnerable services must be isolated from the CIT:404 backend, game database, DCR database, and every production secret. The eval jail must run non-root with read-only filesystem, strict CPU/RAM/process/time limits, restricted egress, and only its own flag secret.

### 3.3 DCR handoff is sound but needs adaptation

The pack assumes `req.user`, `economy.credit()`, and `app.get('gamePool')`. CIT:404 actually uses `req.auth`, internal `applyDelta`, and no `gamePool` app setting. It also constrains ledger kinds.

Required adaptations:

- `req.user` → `req.auth`; use `requireTeam`, not generic admin-capable auth.
- Add an exported economy operation for DCR that uses the **same transaction/client**, locks the team first, updates CIT$/Core Energy, and writes the ledger.
- Add a `DCR_REWARD` ledger kind or deliberately reuse a compatible kind; reflect it in schema, frontend types, labels, and live migration.
- Wire Socket.IO wallet/activity events after commit.
- Add game DB tables: `dcr_missions`, `dcr_solves`, `dcr_attempts`, `dcr_query_log`.
- Keep the DCR investigation DB separate, using only a `dcr_reader` role and safe views.
- Build the full DCR frontend: mission list, mission details, SQL editor, results table, separate answer box, schema helper, first-blood/epilogue UI.

### 3.4 Deployment capacity

The number of challenge definitions does not materially increase core-platform load. The confirmed maximum is 17 teams / 51 authenticated operators, which is modest for one always-on Express/Socket.IO process and its PostgreSQL pool.

The likely pressure point is DCR query concurrency, not the core ledger. The handoff uses a DCR pool of 10, reader-role connection limit 20, 5-second timeout, 200-row cap, and 30 queries/minute/team. These are reasonable for 17 teams but must be load-tested against the actual DCR database plan.

**Current recommendation:** do not migrate the already-working core platform from Railway + Vercel solely because of challenge count. Host vulnerable challenge services separately. Reconsider AWS only after load tests or if organizational requirements demand it.

## 4. Master task list

### Phase A — Decisions and private inputs (blocking)

- [x] Team model confirmed: 17 accounts, exactly 3 operators each; 15 active + 2 reserve.
- [ ] Provide final team names or confirm automatic `TEAM 1 ... TEAM 17` naming.
- [x] HackerRank contest confirmed: `https://www.hackerrank.com/cit-the-moon`, with 7 current problems and a secret key revealed after all hidden tests pass.
- [x] CP difficulty confirmed: A=1★, B=2★, C=2★, D=3★, E=2★, F=4★, G=3★.
- [ ] Replace the currently supplied CP proof keys in HackerRank and CIT:404 before production, or explicitly accept them as final.
- [ ] Obtain `DCR_DATABASE_URL` for the restricted `dcr_reader` role. The pepper is available privately and must be entered directly into the hosting secret manager—not sent through chat or committed.
- [ ] Confirm the supplied DCR hashes were generated with that exact pepper.
- [ ] Approve the recommended UI: top-level CP / CTF / DCR sections; CTF uses subcategory filter chips; DCR uses dedicated nested mission pages.
- [ ] Provide final Field Missions content, tiers, rewards, locations, access codes, and item effects.
- [ ] Provide final Endgame fragments, rewards, codes, story, and unlock conditions.
- [x] Admin shape confirmed: 4 restricted mission-admin accounts + 2 superadmin accounts. Usernames/passwords remain pending and private.
- [ ] Confirm whether sanitized downloads use the AWS challenge host or S3.
- [x] Host the three vulnerable service challenges on an isolated AWS instance, separate from the core platform.

### Phase B — Challenge content security and packaging

- [x] Verify `cit-challs` visibility: confirmed PRIVATE through GitHub.
- [ ] Keep access restricted to challenge authors/organizers and audit collaborators before launch.
- [ ] Rotate flags only if any unauthorized person previously had repository access; otherwise retain them privately.
- [ ] Create a brand-new clean player-artifact repository/bucket with no shared Git history.
- [ ] Strip all `Solution:` and plaintext `flag:` lines from participant materials.
- [ ] Remove committed `venv/` directories; use pinned dependency files instead.
- [ ] Create a normalized challenge manifest containing public metadata only: id, category, subcategory, title, description, difficulty, reward, resource type, public resource URL.
- [ ] Keep actual flags in a private seed input or admin workflow; store only bcrypt hashes in the game DB.
- [ ] Verify every static/download artifact opens correctly and has the intended MIME type.

### Phase C — CP / HackerRank integration

- [ ] Keep HackerRank as the only code execution/grading system.
- [ ] Create 7 `CP` challenge rows in CIT:404, one per HackerRank problem (A–G). A future super-hard CP will become problem 8.
- [ ] Add an external resource field and a prominent button linking to `https://www.hackerrank.com/cit-the-moon`.
- [ ] Store each completion proof key using the existing server-side bcrypt flag workflow; never store plaintext in source or seed SQL.
- [ ] Add beginner instructions: solve on HackerRank, pass all tests, copy the revealed key, return to CIT:404, submit key.
- [ ] Decide whether a CP key is reusable by all teams (current model) or uniquely generated per team. Current supplied keys imply one global key per problem.
- [ ] Test wrong key, correct key, duplicate submission, first blood, and concurrent first solve.

**Proposed unified score matrix (pending organizer approval):** 1★ = 50 CIT$ / 10 CE; 2★ = 100 / 20; 3★ = 150 / 30; 4★ = 300 / 60. This matches DCR. The confirmed seven CP problems would total 950 CIT$ / 190 CE before first-blood bonuses. Define the future super-hard 5★ reward separately.

### Phase D — DCR database and backend

- [ ] Copy/adapt the DCR pack on a dedicated feature branch; do not copy private-answer tooling/data into public source.
- [ ] Run and audit the DCR safe-view/read-only-role SQL on a staging Neon branch.
- [ ] Verify hidden columns and inspect for any additional PII before granting participant access.
- [ ] Add `DCR_DATABASE_URL=` and `ANSWER_PEPPER=` placeholders to `.env.example`; real values only in local/hosting secrets.
- [ ] Apply the DCR game-table migration as a forward, non-destructive migration.
- [ ] Adapt DCR routes to `req.auth` and `requireTeam`.
- [ ] Implement a DCR economy operation on the same transaction/client.
- [ ] Add/migrate the ledger kind and UI labels.
- [ ] Mount `/api/dcr` and `/api/data` behind authentication and `CHALLENGES` phase gating.
- [ ] Seed 15 missions from `missions.json` plus the external hash file.
- [ ] Confirm supplied hashes match the supplied pepper before any UI work proceeds.
- [ ] Improve query error handling to avoid leaking unnecessary database internals.
- [ ] Add graceful DCR pool shutdown and explicit connection/query timeouts.
- [ ] Confirm mission prerequisites M04←M03 and M10←M09.
- [ ] Confirm first blood is +50% for both CIT$ and Core Energy on levels 2–4 only.

### Phase E — DCR frontend and admin visibility

- [ ] Build `/challenges/dcr` list with 15 missions, level/reward/state/first-blood indicators, and progress.
- [ ] Build `/challenges/dcr/:id` mission page.
- [ ] Keep SQL editor and answer box visibly and technically separate.
- [ ] Implement Run SQL → result columns/rows/time/truncation/errors.
- [ ] Implement answer submission → incorrect, solved, duplicate, locked, throttled, first blood, epilogue states.
- [ ] Add collapsible static schema helper from participant guide.
- [ ] Store only SQL drafts in `sessionStorage`; never hashes/pepper/answers.
- [ ] Validate mobile usability at 360px.
- [ ] Add admin DCR dashboard: solves by team/mission, attempts, query log, and a safe test-team reset.

### Phase F — CTF catalog and resource model

- [ ] Extend challenge metadata to support `STANDARD`, `EXTERNAL`, `DOWNLOAD`, and `SERVICE` resources (or equivalent explicit fields).
- [ ] Add a CTF subcategory: Crypto, OSINT, Misc, Steganography, Web.
- [ ] Import all 15 current sanitized CTF descriptions and private flags; reserve a slot for the future super-hard challenge 16.
- [ ] Build resource UI: download button, external link, HTTP service URL, TCP endpoint with copy action.
- [ ] Ensure no resource response leaks a flag or organizer notes.
- [ ] Keep existing server-side flag verification, first-blood locking, wallet update, and ledger behavior.

### Phase G — Individual CTF readiness

- [ ] Crypto 1/2/3: verify intended ciphertext/key/hints and difficulty; remove answer lines.
- [ ] OSINT 1: verify GitHub Pages target and Wayback snapshot remain available.
- [ ] OSINT 2: verify Google Maps target is stable and accessible without organizer login.
- [ ] OSINT 3: verify social profile remains public for the event.
- [ ] Misc Git: point participants to a dedicated sanitized challenge repository, not the answer repository.
- [ ] Misc eval jail: rebuild/deploy in a hardened isolated container; load test concurrent TCP sessions.
- [ ] Misc Discord: verify the target profile remains available/public.
- [ ] Misc logs: distribute only `server.log`; verify reconstruction order and intended answer.
- [ ] Stego image: distribute image only; verify metadata survives upload/CDN processing.
- [ ] Stego audio: distribute WAV without transcoding; add intended hint/description if needed.
- [ ] SQLi web: add pinned requirements, remove bundled venv and solution README, containerize, verify reset behavior.
- [ ] IDOR web: disable Flask debug mode, correct endpoint documentation, resolve/confirm missing asset, containerize.
- [ ] DevTools web: deploy static files; preserve intentional decoys and confirm only the intended client-side flag is accepted.

**Proposed current CTF difficulty map (pending your approval):**

| Group | Challenge | Proposed level |
|---|---|---:|
| Crypto | Base64 (`bizuu64`) | 1★ |
| Crypto | Vigenère | 2★ |
| Crypto | Binary-to-ASCII | 1★ |
| OSINT | Wayback Machine | 2★ |
| OSINT | Google Maps location | 2★ |
| OSINT | Social-profile bio | 1★ |
| Misc | Git history | 1★ |
| Misc | Python eval jail | 4★ |
| Misc | Discord profile | 1★ |
| Misc | Log reconstruction | 2★ |
| Stego | Image EXIF | 1★ |
| Stego | Audio spectrogram | 2★ |
| Web | SQL injection | 2★ |
| Web | IDOR | 1★ |
| Web | DevTools/static source | 1★ |

Under the proposed unified matrix this set totals 1,300 CIT$ / 260 CE before first-blood bonuses.

### Phase H — Team count, authentication, and admin roles

- [ ] Replace frontend hardcoded team count (12) with a server-provided list/configuration.
- [ ] Set `SEED_TEAM_COUNT=17` and test a fresh seed: 17 team codes and 17 initial ledger rows.
- [ ] Use a searchable/selectable team control that works cleanly for 17 teams.
- [ ] Review login rate limiting for 51 operators behind one venue NAT; prefer per-team controls plus a broad IP safety limit.
- [ ] Add and enforce roles: `mission_admin` and `superadmin`.
- [ ] Mission admins may access mission queue/codes and read enough team identity to validate outcomes; they may not change phases, edit challenges, adjust wallets, grant items, lock teams, revoke sessions, send global alerts, or access platform secrets.
- [ ] Two superadmins retain full control. Create all six accounts privately; never seed plaintext production passwords into Git.
- [ ] Add session revocation/role tests.

### Phase I — Field Missions, items, and Endgame

- [ ] Replace placeholder field Missions with final organizer-approved content.
- [ ] Validate consent/safety wording for public photo/video/audio tasks.
- [ ] Confirm mission difficulty tiers, costs, rewards, timers, proof requirements, and admin resolution flow.
- [ ] Decide which Marketplace items remain. Most current seeded item descriptions have no implemented effect.
- [ ] Implement every retained item effect end-to-end or remove/relabel it before launch.
- [ ] Replace placeholder Endgame content and codes.
- [ ] Define Endgame unlock requirements and verify story content is not sent before solve.
- [ ] Update participant guide after final rules/content are approved, without exposing secret content.

### Phase J — Core platform correctness and operations

- [ ] Wrap multi-team notification creation in one transaction; emit only after commit.
- [ ] Validate phase durations, challenge category, admin adjustments, IDs, and quantities before SQL; return 4xx instead of generic 500s.
- [ ] Add phase-change confirmation and audit log (who changed what and when).
- [ ] Fix ledger labels and any stale enum names.
- [ ] Add structured request/error logging with secret redaction.
- [ ] Add graceful shutdown for HTTP, Socket.IO, game DB pool, and DCR pool.
- [ ] Add readiness endpoint that checks both game DB and (optionally) DCR DB.
- [ ] Add automated backend tests for economy, auth, phases, CP keys, DCR, notifications, and concurrency.
- [ ] Add frontend typecheck/build and targeted UI tests.

### Phase K — Capacity tests for 17 teams / 51 operators

- [ ] Create a staging DB and staging secrets; never load-test production state.
- [ ] Simulate 51 connected Socket.IO clients across 17 teams, then run an additional 100-client headroom test.
- [ ] Simulate concurrent logins behind a shared NAT.
- [ ] Simulate CP/CTF flag submissions and first-blood races.
- [ ] Simulate DCR query bursts, including slow/invalid queries and 200-row truncation.
- [ ] Monitor Node CPU/RAM/event-loop delay, game DB pool wait, DCR pool wait, Neon query latency, Socket reconnects, and HTTP error rate.
- [ ] Pass targets: no duplicate payouts, no pool exhaustion, no unbounded queue, no secret leakage, acceptable p95 latency, recovery after restart.
- [ ] Run a complete dress rehearsal with at least 3 teams and all admins.

### Phase L — Deployment decision

**Recommended baseline:**

- Vercel: static React frontend.
- Railway: always-on core Express/Socket.IO backend + game Postgres.
- Neon: separate DCR read-only investigation database.
- Isolated AWS host for vulnerable CTF services.
- Sanitized downloads from S3/CloudFront (preferred) or the isolated AWS host.

This architecture should comfortably handle 17 teams / 51 operators after load testing. Challenge count alone is not a reason to move.

**Confirmed AWS challenge-host option:** keep the core on Railway/Vercel, but run the three intentionally vulnerable services on one dedicated EC2 instance (recommend 2 vCPU / 4 GB RAM for headroom) using separate Docker containers, non-root users, resource limits, separate networks, and one secret per challenge. Use an Elastic IP plus domain/subdomains and HTTPS through Caddy/Nginx; do not rely on bare HTTP IPs. Restrict SSH to organizer IPs. Expose only 80/443 and the required TCP challenge port. The instance must have no game/DCR database credentials and no route into the core database.

Do not migrate the core close to the event without a full staging rehearsal and a tested rollback to Railway/Vercel.

### Phase M — Production reset and launch runbook

- [ ] Stop using every credential/code exposed during testing.
- [ ] Rotate JWT secret, admin passwords, team join codes, CP proof keys, CTF flags, mission/endgame codes, DCR reader password, and answer pepper/hashes if necessary.
- [ ] Seed the final team count and save credentials privately exactly once.
- [ ] Remove any destructive pre-deploy DB reset step.
- [ ] Verify exact production CORS origin and HTTPS/WSS.
- [ ] Warm DCR Neon before doors open; ensure Railway/core services cannot sleep.
- [ ] Verify all external OSINT/social/Discord/Map targets.
- [ ] Verify all live challenge endpoints and download links from venue Wi-Fi and mobile data.
- [ ] Take a database backup/snapshot before opening.
- [ ] Prepare incident controls: freeze phase, lock team, revoke session, disable challenge, manually adjust with reason, restore DB, communicate outage.
- [ ] Keep one staging/test team and one admin device available throughout the event.

## 5. Architecture decision now

**Provisional decision:** keep the core on Railway + Vercel while development continues. Do not put vulnerable challenge services in the core Railway service. Use separate isolated services/projects (or AWS containers) for those challenges. Make the final core-hosting decision only after the ~100-player load test.

The current platform's strongest part is transactional scoring/ledger concurrency. Preserve that and integrate CP, CTF, DCR, Missions, and Endgame through the existing economy layer rather than introducing parallel scoring systems.

## 6. Information still needed from the organizer

1. Final team names (or approval of `TEAM 1 ... TEAM 17`).
2. Decision whether the currently supplied CP keys are final or will be regenerated.
3. Approval of the proposed unified reward matrix and the proposed CTF difficulties.
4. Approval of the recommended CTF subcategory-filter UI.
5. Final Field Missions JSON/content and all rules/rewards.
6. Final Endgame story/content/rewards/unlock rules.
7. Final Marketplace item list and intended effects.
8. Names/usernames for 4 mission admins and 2 superadmins; passwords must be generated privately.
9. DCR restricted reader URL. Enter the existing pepper directly into Railway later; do not send it in chat.
10. Decide whether downloads use S3/CloudFront or the EC2 challenge host.
11. Event timing/order, freeze windows, and whether CP/CTF/DCR run simultaneously inside CHALLENGES.
12. Any branding/UI changes beyond the existing terminal theme and updated event guide.
