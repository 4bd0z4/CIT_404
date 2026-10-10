import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

// Simulates ~51 operators (17 teams x 3) hitting the live platform during the
// CHALLENGES phase: login, load game state, list challenges, submit flags,
// poll leaderboard/notifications. Read-heavy with periodic writes, like a real
// event. Team codes are passed in via TEAM_CODES (comma-separated).

const BASE = __ENV.BASE || 'https://cit404-production.up.railway.app';
const TEAM_CODES = (__ENV.TEAM_CODES || '').split(',').map((s) => s.trim()).filter(Boolean);

const loginTrend = new Trend('login_ms');
const stateTrend = new Trend('state_ms');
const errRate = new Rate('errors');

export const options = {
  scenarios: {
    operators: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 51 }, // everyone arrives
        { duration: '90s', target: 51 }, // sustained play
        { duration: '20s', target: 0 },  // wind down
      ],
      gracefulStop: '10s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],      // <2% transport failures
    http_req_duration: ['p(95)<1500'],   // p95 under 1.5s
    errors: ['rate<0.05'],
  },
};

// Each VU is one operator; a token is cached per-VU so we log in once, like
// a real operator who keeps their session, not on every iteration.
const tokenCache = {};

function teamForVU() {
  if (TEAM_CODES.length === 0) return null;
  const teamIndex = Math.floor((__VU - 1) / 3) % TEAM_CODES.length;
  return { num: teamIndex + 1, code: TEAM_CODES[teamIndex] };
}

export default function () {
  const team = teamForVU();
  if (!team) {
    errRate.add(1);
    return;
  }

  // --- login once per VU, then reuse the token ---
  let token = tokenCache[__VU];
  if (!token) {
    const r = http.post(`${BASE}/api/auth/team`, JSON.stringify({
      teamName: `TEAM ${team.num}`,
      joinCode: team.code,
      nickname: `op${__VU}`,
    }), { headers: { 'Content-Type': 'application/json' } });
    loginTrend.add(r.timings.duration);
    const ok = check(r, { 'login 200': (res) => res.status === 200 });
    errRate.add(!ok);
    if (!ok) { sleep(1); return; }
    token = r.json('accessToken');
    tokenCache[__VU] = token;
  }

  const auth = { headers: { Authorization: `Bearer ${token}` } };

  // --- initial boot: state + challenges ---
  let r = http.get(`${BASE}/api/game/state`, auth);
  stateTrend.add(r.timings.duration);
  check(r, { 'state 200': (res) => res.status === 200 });

  r = http.get(`${BASE}/api/game/challenges`, auth);
  check(r, { 'challenges 200': (res) => res.status === 200 });

  // --- play loop: polling + occasional submit ---
  for (let i = 0; i < 5; i++) {
    http.get(`${BASE}/api/game/leaderboard`, auth);
    http.get(`${BASE}/api/game/notifications`, auth);
    http.get(`${BASE}/api/game/feed`, auth);

    if (Math.random() < 0.25) {
      const wrong = JSON.stringify({ challengeCode: 'CTF-CR-01', flag: `CIT{guess_${__VU}_${i}}` });
      http.post(`${BASE}/api/game/submit-flag`, wrong, {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
    }
    sleep(1 + Math.random() * 2);
  }
}
