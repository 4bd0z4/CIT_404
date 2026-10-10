# CIT: 404 — Architectural Review

_Reviewed from a clean clone, nothing modified. Covers every file under
`Backend/`, `frontend/`, `Infrastructure & Deployment/`, `legacy-vanilla/`
and the root config._

---

## 1. What this project actually is

A short-lived event platform for a CTF-style game called "CIT: 404 — Recovery
Protocol". Two apps share one Postgres DB:

- **Operator app** — teams of 3 share one wallet; play through 3 phases
  (CHALLENGES → MISSIONS → ENDGAME) gated by an admin.
- **Admin app** — supervises phases, teams, items, missions, endgame codes,
  notifications, the ledger.

**Stack**

- Backend: Express 4 + Socket.IO + Postgres (`pg` 8), bcryptjs, jsonwebtoken,
  express-rate-limit, cookie-parser.
- Frontend: React 19 + Vite 6 + Tailwind v4 + Radix primitives + TanStack
  Query + Recharts + Sonner.
- Infra: Postgres via Docker **or** a portable-binary PowerShell installer,
  deploy target is any process-persistent host (Render/Railway/Fly).

**Design keystone**: the `ledger` table is the source of truth. `teams.cit_balance`
and `team_inventory` are projections. Every money/energy/item move funnels
through `Backend/lib/economy.js` inside a transaction with
`SELECT ... FOR UPDATE` on the team row.

---

## 2. What's genuinely good

### 2.1 Economy / concurrency model (`lib/economy.js`)

- Single funnel for every balance mutation. Three operators per team share a
  wallet, so each function locks the team row first, then the item/challenge/
  mission row — in a **documented, consistent order**, so two transactions
  can't deadlock on reversed pairs.
- Partial-unique index `idx_one_first_blood ON submissions(challenge_id) WHERE is_first_blood`
  enforces "exactly one first blood per challenge" **in the DB, not in app code**.
  Same for `idx_one_solve_per_team`.
- `CHECK (cit_balance >= 0)` plus `GREATEST(0, core_energy + $2)` prevents
  negative balances from any path.
- The notification expiry sweep (every 15 s) uses the same `resolveNotification`
  function with a `FOR UPDATE` guard, so an admin manually resolving at the
  same moment as the sweep cannot double-charge.

### 2.2 Auth design (`lib/tokens.js`, `routes/auth.js`, `middleware/auth.js`)

- 15-min access JWT **in memory only** (`frontend/src/lib/api.ts`) + httpOnly
  SameSite refresh cookie, hashed in the `sessions` table. Clear defense
  against XSS lifting durable creds.
- Rotation on every refresh (stolen cookie dies on next legitimate refresh).
- Single-flight refresh in `api.ts` to survive React StrictMode double-mount —
  explicitly documented.
- Rate limit (20 / 10 min) + bcrypt comparison against a dummy hash when the
  team doesn't exist, so response time doesn't leak team-name validity.
- Socket.IO handshake reuses the same JWT; room joins are server-decided
  (`io.on('connection')`), so a team can't subscribe to another team's wallet
  events.
- `JWT_SECRET` required in production (throws at startup if missing).

### 2.3 Schema (`init.sql`)

- Clean separation: `items` (catalog) / `team_inventory` (projection) / `ledger`
  (audit). The ledger carries `balance_after`, `energy_after`, operator, admin,
  item/challenge/mission/endgame/notification FKs — enough to replay or audit
  anything.
- `JSONB payload` on items means adding an item type doesn't require a migration.
- Views (`v_team_stats`, `v_team_items`, `v_item_popularity`, `v_leaderboard`)
  do the heavy aggregation server-side so admin pages do one query each.
- Phase model is explicit: `game_state` singleton + `phase_config` per phase
  + `requirePhase()` middleware that rejects on both wrong phase AND
  expired-countdown.
- `CHECK (kind = 'NORMAL' OR deadline_at IS NOT NULL)` on `notifications`
  makes "urgent without a deadline" impossible by schema.

### 2.4 Frontend architecture

- Admin bundle is `lazy()`-loaded (operators on phones never pay for Recharts).
  Documented in `App.tsx`.
- Context + provider split (`auth-context.ts` vs `auth.tsx`, same for game)
  to keep Fast Refresh working — the comment calls out why.
- No optimistic local arithmetic on the wallet: the server's value wins,
  which is correct for a 3-operator shared wallet.
- Query invalidation keys are consistent; socket events invalidate the right
  query keys.
- `UrgentOverlay` uses Radix Dialog with `onEscapeKeyDown` / `onInteractOutside`
  prevented — correctly implements the "can't miss it by accident" requirement.

### 2.5 Infrastructure

- The PowerShell script (`setup-local-db.ps1`) is unusually careful: portable
  binaries (no admin rights, no Windows service), password passed via file
  (not visible in `ps`), `listen_addresses='localhost'`, `-ON_ERROR_STOP=1`
  on psql, lifecycle verbs (start/stop/status/reset).
- `docker-compose.yml` is minimal and uses the official 16-alpine image with
  the init scripts auto-mounted.
- `.gitignore` properly excludes `.env`, `node_modules`, `dist`.

---

## 3. What's broken or materially risky

### 3.1 Items that lie about what they do (biggest functional gap)

`seed.sql` ships 12 items. The backend `useItem` function only has special
behavior for **2** of them:

- `INSURANCE` — checked by `resolveMission` when outcome is FAILED.
- `ACCESS_COORD` — returns `revealed.coordinates`.

The other 10 (`HINT_L1`, `HINT_L2`, `SOLUTION_FRAG`, `BOOST_TIME`,
`HINT_SCANNER`, `DOUBLE_REWARD`, `MISSION_REROLL`, `ACCESS_ROUTE`,
`ACCESS_PASS`, `EXTRA_TRY`) consume a unit, write an `ITEM_USE` ledger row,
and **do nothing else**. The operator UI advertises effects like "Adds 15
minutes to the current mission timer" and "Doubles the next mission reward"
that will never happen. Either implement the handlers in `economy.useItem`
or remove/relabel them before the event.

### 3.2 `vercel.json` is a trap

The README explicitly warns against deploying to Vercel (WebSockets won't
survive serverless), yet `Infrastructure & Deployment/vercel.json` is
committed with a config that rewrites `/api/*` to `Backend/server.js`.
Someone will see it and try. **Note**: a Vercel-for-frontend + Railway-for-backend
split works perfectly; see §6. Either way, this file as it stands is wrong.

### 3.3 `legacy-vanilla/` is referenced as "for reference" but increases confusion

~34 KB of unwired code with a different data model (localStorage, no backend
auth). Fine to keep in a branch or `/docs/legacy`, but shipping it under the
main repo root invites accidental edits.

### 3.4 No distinction between `admin` and `superadmin` roles

The schema has `admins.role CHECK (role IN ('admin','superadmin'))` and the
seed creates `superadmin`, but **no route anywhere checks the role**.
`requireAdmin` only checks `req.auth.kind === 'admin'`. If you want tiered
permissions (e.g. only superadmin can lock a team, change phase, grant items),
it's not enforced — either implement it or drop the column.

### 3.5 `admin/notifications` POST is not atomic across teams

```js
for (const teamId of targets) {
    const { rows } = await db.query(`INSERT INTO notifications ...`);
    rt.broadcastNotification(teamId, rows[0]);
}
```

If the server crashes mid-loop, you get partial transmission. For 12 teams
this is low-impact, but wrapping it in `db.withTransaction` costs nothing.

### 3.6 `/admin/teams/:id/adjust` with a huge negative amount throws a 500

The code trusts the DB `CHECK (cit_balance >= 0)` to catch it. The constraint
violation is a Postgres error, not an `EconomyError`, so it bubbles out of
`handleEconomyError` into the generic error handler and the admin sees
"SYSTEM FAILURE DETECTED." instead of "would push balance below zero."
Pre-check in `economy.adminAdjust`.

### 3.7 `durationMin` input validation is loose

`POST /admin/phase` does `Number(durationMin)` without rejecting `NaN` or
non-positive values. A bad payload reaches the SQL
`($2 || ' minutes')::interval` and errors generically. The PATCH on
`/phase/:phase/duration` does validate (`Number.isInteger && > 0`); do the
same on the POST.

### 3.8 Rate-limiter proxy trust

`app.set('trust proxy', 1)` is correct for a single proxy (the suggested
Render/Railway hosts), but if you ever front it with Cloudflare + a
hosting-provider proxy, you'll get header-spoofable client IPs. Worth a
comment.

### 3.9 Operator nickname: empty-after-trim is allowed

```js
nickname.trim().slice(0, 32)
```

A nickname of `"     "` becomes `""`. The `operators` table permits empty
strings. Not catastrophic (login still works, the operator just has no
displayable name), but a one-line `if (!clean) return 400` is cheap.

### 3.10 Mission/endgame access codes are stored in cleartext

That's intentional (admins need to read them on screen), but it means a DB
leak hands over the whole game. For a few-hour event this is acceptable;
just know it. If the DB ever gets reused, rotate codes between events.

---

## 4. Smaller things worth fixing

### Backend

- `routes/admin.js → POST /challenges` doesn't validate `category` is one of
  `('CP','CTF','DATA')`; relies on the DB CHECK and surfaces a 500.
- `v_item_popularity.revenue` uses `SUM(total_bought) * current_cost` — if an
  admin edits item cost mid-event, historical revenue becomes retroactively
  wrong. A view based on `SUM(-ledger.amount) WHERE kind='ITEM_PURCHASE'` is
  more accurate.
- Phase changes aren't audited anywhere (no ledger entry, no `admin_actions`
  table). With multiple admins, you lose "who switched to ENDGAME at 15:03."
- No request-level logging. A single `morgan('tiny')` would help during the
  event.
- No tests. For a one-shot event this is defensible; mention it so nobody is
  surprised.

### Frontend

- `TransactionLog.KIND_LABEL` maps `INSURANCE_REFUND` (never emitted) and
  misses `FIRST_BLOOD`, `ENDGAME_REWARD`, `NOTIF_REWARD`, `NOTIF_PENALTY` —
  those render as raw enum values.
- `AdminLayout`'s phase switcher mutates on click with **no confirmation**.
  One misclick resets a running phase chrono for 12 teams. A `window.confirm`
  or a small modal is a 5-line safety net.
- `prefers-reduced-motion` is honored for the typewriter and scanlines, but
  the `GlitchTitle` animation (`glitch-shift` keyframes) still runs. Easy to
  gate behind the same media query.
- Caret-ranged deps everywhere (`^19.0.0`, `^4.0.6`). Lockfile pins them, but
  CI/deploy should use `npm ci`, not `npm install`.

### Infrastructure

- `setup-local-db.ps1` is Windows-only. The docker-compose path covers Linux/macOS,
  but a `setup-local-db.sh` would be symmetric.
- No README section about rotating `JWT_SECRET` between events (invalidates
  all sessions, which is desirable).

---

## 5. Priority order for fixes

In impact-to-effort order:

1. **Delete or correct `vercel.json`.** Prevents a bad deploy. (See §6 for the
   correct split.)
2. **Decide on the item catalog**: either implement the 10 effectless items
   in `economy.useItem`, or remove them from `seed.sql`.
3. **Wrap the notification broadcast loop in `withTransaction`** (3-line
   change).
4. **Pre-validate** admin adjust / phase duration / challenge category to
   return proper 400s instead of 500s.
5. **Add a confirmation step** on admin phase changes.
6. **Decide on `admin` vs `superadmin`** — enforce it or drop it.
7. **Fix the ledger label map** in `TransactionLog.tsx`.
8. **Audit log for phase changes** (single `admin_actions` table).
9. **Relocate or delete `legacy-vanilla/`**.
10. **Honor `prefers-reduced-motion` on the glitch title**.

---

## 6. Deployment: Vercel + Railway (yes, this works — but not the way `vercel.json` claims)

The repo's `vercel.json` tries to deploy the whole backend to Vercel as a
single serverless function. **That cannot work** because:

- Socket.IO needs a persistent TCP/WebSocket connection; Vercel's serverless
  runtime kills the function at the end of each HTTP request.
- The 15-second notification sweep (`setInterval` in `server.js`) also needs
  a persistent process.

But a two-host split works great:

### 6.1 Correct split

| Piece                              | Host                      | Why                                                               |
| ---------------------------------- | ------------------------- | ----------------------------------------------------------------- |
| `frontend/dist` (static React build) | **Vercel** (or Netlify/Cloudflare Pages) | Pure static. Free, global CDN.                                    |
| `Backend/server.js`                | **Railway** (or Render / Fly.io) | Needs a long-running Node process for Socket.IO + the timer.     |
| Postgres                           | **Railway Postgres** (addon) | Co-located with the backend; `DATABASE_URL` injected automatically. |

### 6.2 Minimal setup

**Backend on Railway**

1. New Railway project → **New Service → GitHub repo** → set root to `Backend/`.
2. Add a **Postgres plugin**; Railway auto-injects `DATABASE_URL`.
3. Set env vars:
   - `JWT_SECRET` — generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
   - `NODE_ENV=production`
   - `CORS_ORIGINS=https://<your-vercel-domain>.vercel.app` (exact origin, no trailing slash)
   - optionally override `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL_DAYS`
4. Start command: `node server.js` (already in `package.json`).
5. First deploy: run `npm run seed` once via Railway's shell — captures the
   admin password and team codes.
6. Apply `init.sql` + `seed.sql` to the Railway Postgres (either via the
   Railway psql shell or a local `psql $DATABASE_URL -f ...`).

**Frontend on Vercel**

1. New Vercel project → point at the same repo, **root = `frontend/`**.
2. Framework preset: **Vite**. Build: `npm run build`. Output: `dist`.
3. Set env var:
   - `VITE_SOCKET_URL=https://<your-railway-backend>.up.railway.app`
     (the `socket.ts` file already reads this; without it, Socket.IO will try
     same-origin and fail against Vercel).
4. **Also** proxy `/api/*` from Vercel to Railway so the frontend's relative
   `/api/...` calls work and the refresh cookie stays first-party. Add a
   `frontend/vercel.json`:

   ```json
   {
     "rewrites": [
       { "source": "/api/:path*", "destination": "https://<railway-backend>.up.railway.app/api/:path*" }
     ]
   }
   ```

   This keeps the httpOnly refresh cookie first-party. Without it you'd be
   doing cross-origin cookie POSTs, which is possible (`SameSite=None; Secure`
   is already set in prod) but adds a browser-level failure mode.

5. Delete the existing `Infrastructure & Deployment/vercel.json`. It would
   mislead a future Vercel import.

### 6.3 Checklist before the event

- [ ] HTTPS on both sides (Railway and Vercel do this automatically).
- [ ] `CORS_ORIGINS` on the backend matches the exact Vercel domain the
      operators will type (including the preview URL if that's what you
      distribute).
- [ ] `JWT_SECRET` is a real random string, not `change-me-before-the-event`.
- [ ] Seed script was run **once** and the admin password + 12 team codes are
      stored somewhere safe (they're bcrypt-hashed and unrecoverable).
- [ ] A smoke test from a phone on venue wifi: login → open socket → see
      live wallet update when another operator spends.
- [ ] Confirmed the Railway service is **not** on a sleep plan — Socket.IO
      drops when the dyno sleeps.

### 6.4 Costs (rough, 2026 pricing — verify before committing)

- Vercel Hobby: free, static only.
- Railway: a few $/month for the smallest always-on process + a tiny Postgres.
  For an event lasting a few hours total you'll pay single-digit dollars.

### 6.5 Alternatives if you don't want two hosts

- **Everything on Railway**: serve `frontend/dist` from Express
  (`server.js` already does `app.use(express.static(clientDist))`). Build the
  frontend in Railway's build step, or commit `dist/` for simplicity. One
  domain, no CORS worries.
- **Everything on Fly.io or Render**: same shape.

For a 12-team, few-hours event, the simplest deployment is **the single
Railway box serving both** — zero CORS, zero cross-domain cookie fuss, and
the same `server.js` static-serve path the code already supports.
