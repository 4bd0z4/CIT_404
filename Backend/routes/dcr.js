// Express router for the DCR (Data Crime Reconstruction) module: the
// mission list, a single mission page and typed-answer submission.
//
// MOUNTING (done by the main agent, OUTSIDE this file):
//   const { requireTeam } = require('./middleware/auth');
//   const phase = require('./lib/phase');
//   app.use('/api/dcr', requireTeam, phase.requirePhase('CHALLENGES'), require('./routes/dcr'));
//
// This module assumes it sits behind an auth guard that populates
//   req.auth = { teamId, teamName, operatorId, nickname }
// exactly like routes/game.js. The Challenge-phase guard is also applied
// at mount time, so there is no phase check inside here.
//
// GAME DATABASE POOL: by default this uses ../db_config (the pool that
// holds teams, ledger and the dcr_* tables). A caller may override it with
//   app.set('gamePool', somePool)
// which takes precedence if present (handy for tests).
//
// ECONOMY: crediting CIT$ / Core Energy is deliberately NOT implemented
// here. See `setAwardCallback` / `awardReward` below — the main agent wires
// a real award function (e.g. a future economy.creditDcr) at integration
// time. Until then the award step is a well-defined no-op that still
// records the solve and the paid amounts in dcr_solves.
const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db_config');
const rt = require('../lib/realtime');
const { hashAnswer, sameHash } = require('./dcrAnswers');

const router = express.Router();
router.use(express.json({ limit: '4kb' }));

const FIRST_BLOOD_BONUS = 1.5;      // +50 %, same multiplier as the other challenges
const MAX_WRONG_PER_WINDOW = 10;    // wrong answers per team and mission ...
const WINDOW_MINUTES = 10;          // ... per 10 minutes

/** The game-database pool: an app-level override wins, else the shared db_config pool. */
const gamePool = (req) => req.app.get('gamePool') || db.pool;

// ---------------------------------------------------------------------
// ECONOMY HOOK (integration point)
//
// `awardReward(client, ctx)` runs inside the SAME transaction/client that
// has the mission row locked and the solve already recorded. A real
// implementation MUST:
//   - lock the team row (SELECT ... FOR UPDATE) before any arithmetic,
//   - credit `ctx.cit` CIT$ and `ctx.ce` Core Energy to the team,
//   - write a ledger line (reason like `DCR ${missionId}` or
//     `DCR ${missionId} (first blood)`), and
//   - never throw unless the whole submission should roll back.
//
// The main agent injects it with setAwardCallback(fn) at wiring time, e.g.
//   const economy = require('../lib/economy');
//   dcr.setAwardCallback((client, ctx) => economy.creditDcr(client, ctx));
// We do NOT call economy.creditDcr here because it does not exist yet.
// ---------------------------------------------------------------------
let awardCallback = null;

/** Inject the real economy award function. Pass null to clear it. */
function setAwardCallback(fn) {
    if (fn !== null && typeof fn !== 'function') {
        throw new TypeError('setAwardCallback expects a function or null.');
    }
    awardCallback = fn;
}

/**
 * Credits the reward if (and only if) an award callback has been injected.
 * ctx = { client, teamId, operatorId, nickname, missionId, cit, ce, firstBlood }.
 * When no callback is wired the solve is still recorded (dcr_solves holds
 * cit_paid / ce_paid); only the wallet movement is deferred to integration.
 */
async function awardReward(client, ctx) {
    if (!awardCallback) throw new Error('DCR economy callback is not configured.');
    return awardCallback(client, ctx);
}

// A mission is locked while its prerequisite is not yet solved by the team.
const MISSIONS_SQL = `
  SELECT m.id, m.level, m.title, m.reward_cit, m.reward_ce, m.first_blood_eligible, m.prerequisite,
         (s.mission_id IS NOT NULL) AS solved,
         (m.prerequisite IS NOT NULL AND p.mission_id IS NULL) AS locked
    FROM dcr_missions m
    LEFT JOIN dcr_solves s ON s.mission_id = m.id AND s.team_id = $1
    LEFT JOIN dcr_solves p ON p.mission_id = m.prerequisite AND p.team_id = $1
   ORDER BY m.id`;

/** GET /api/dcr/missions — list only. No story, no question, no answer. */
router.get('/missions', async (req, res, next) => {
    try {
        const { rows } = await gamePool(req).query(MISSIONS_SQL, [req.auth.teamId]);
        res.json({
            missions: rows.map((m) => ({
                id: m.id,
                level: m.level,
                title: m.title,
                rewardCit: m.reward_cit,
                rewardCe: m.reward_ce,
                firstBloodEligible: m.first_blood_eligible,
                status: m.solved ? 'SOLVED' : m.locked ? 'LOCKED' : 'OPEN',
                requires: m.locked ? m.prerequisite : null,
            })),
        });
    } catch (err) { next(err); }
});

/** GET /api/dcr/missions/:id — the content of one mission page. Never the hash. */
router.get('/missions/:id', async (req, res, next) => {
    try {
        const { rows } = await gamePool(req).query(
            `SELECT m.*, (s.mission_id IS NOT NULL) AS solved,
                    (m.prerequisite IS NOT NULL AND p.mission_id IS NULL) AS locked
               FROM dcr_missions m
               LEFT JOIN dcr_solves s ON s.mission_id = m.id AND s.team_id = $2
               LEFT JOIN dcr_solves p ON p.mission_id = m.prerequisite AND p.team_id = $2
              WHERE m.id = $1`,
            [req.params.id, req.auth.teamId]
        );
        const m = rows[0];
        if (!m) return res.status(404).json({ error: 'NOT FOUND', message: 'Unknown mission.' });
        if (m.locked) {
            return res.status(403).json({ error: 'LOCKED', message: `Solve ${m.prerequisite} first.` });
        }
        res.json({
            id: m.id,
            level: m.level,
            title: m.title,
            story: m.story,
            question: m.question,
            answerFormat: m.answer_format,
            rewardCit: m.reward_cit,
            rewardCe: m.reward_ce,
            firstBloodEligible: m.first_blood_eligible,
            solved: m.solved,
            // The epilogue is only ever returned once the mission is solved,
            // so the twist cannot be read straight from the network tab.
            epilogue: m.solved ? m.epilogue || null : null,
        });
    } catch (err) { next(err); }
});

const answerLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    keyGenerator: (req) => `dcr_ans_${req.auth.teamId}`, // behind auth, so req.auth always exists
    standardHeaders: true,
});

/**
 * POST /api/dcr/missions/:id/answer
 * Submit a typed answer. The SQL the player ran against the DCR database is
 * never evaluated here — only the free-text answer they derived from it.
 */
router.post('/missions/:id/answer', answerLimiter, async (req, res, next) => {
    const raw = req.body?.answer;
    if (typeof raw !== 'string' || !raw.trim() || raw.length > 200) {
        return res.status(400).json({ error: 'BAD REQUEST', message: 'Type an answer (200 characters max).' });
    }

    const { teamId, operatorId, nickname } = req.auth;
    const client = await gamePool(req).connect();
    try {
        await client.query('BEGIN');

        // Global lock order is always team first, then domain row. This must
        // happen before locking the DCR mission to avoid deadlocks with other
        // economy operations.
        const { rows: teamRows } = await client.query(
            'SELECT id, is_locked FROM teams WHERE id = $1 FOR UPDATE',
            [teamId]
        );
        if (!teamRows[0]) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'NOT FOUND', message: 'Team not found.' });
        }
        if (teamRows[0].is_locked) {
            await client.query('ROLLBACK');
            return res.status(423).json({ error: 'LOCKED', message: 'TEAM ACCOUNT FROZEN BY THE CORE.' });
        }

        // The row lock serialises submissions on this mission, so first blood
        // has exactly one winner even under a simultaneous tie.
        const { rows: [m] } = await client.query(
            'SELECT * FROM dcr_missions WHERE id = $1 FOR UPDATE',
            [req.params.id]
        );
        if (!m) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'NOT FOUND', message: 'Unknown mission.' }); }

        if (m.prerequisite) {
            const { rowCount } = await client.query(
                'SELECT 1 FROM dcr_solves WHERE team_id = $1 AND mission_id = $2',
                [teamId, m.prerequisite]
            );
            if (!rowCount) {
                await client.query('ROLLBACK');
                return res.status(403).json({ error: 'LOCKED', message: `Solve ${m.prerequisite} first.` });
            }
        }

        const done = await client.query(
            'SELECT 1 FROM dcr_solves WHERE team_id = $1 AND mission_id = $2',
            [teamId, m.id]
        );
        if (done.rowCount) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'ALREADY SOLVED', message: 'Already solved by your team.' });
        }

        const { rows: [w] } = await client.query(
            `SELECT COUNT(*)::int AS n FROM dcr_attempts
              WHERE team_id = $1 AND mission_id = $2 AND NOT correct
                AND submitted_at > now() - make_interval(mins => $3)`,
            [teamId, m.id, WINDOW_MINUTES]
        );
        if (w.n >= MAX_WRONG_PER_WINDOW) {
            await client.query('ROLLBACK');
            return res.status(429).json({ error: 'THROTTLED', message: `Too many wrong answers. Wait ${WINDOW_MINUTES} minutes.` });
        }

        const correct = sameHash(hashAnswer(m.id, raw), m.answer_hash);
        await client.query(
            'INSERT INTO dcr_attempts (team_id, mission_id, nickname, correct) VALUES ($1,$2,$3,$4)',
            [teamId, m.id, nickname, correct]
        );
        if (!correct) { await client.query('COMMIT'); return res.json({ correct: false }); }

        let firstBlood = false;
        if (m.first_blood_eligible) {
            const { rowCount } = await client.query(
                'SELECT 1 FROM dcr_solves WHERE mission_id = $1 LIMIT 1',
                [m.id]
            );
            firstBlood = rowCount === 0;
        }
        const cit = firstBlood ? Math.round(m.reward_cit * FIRST_BLOOD_BONUS) : m.reward_cit;
        const ce = firstBlood ? Math.round(m.reward_ce * FIRST_BLOOD_BONUS) : m.reward_ce;

        await client.query(
            `INSERT INTO dcr_solves (team_id, mission_id, nickname, first_blood, cit_paid, ce_paid)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [teamId, m.id, nickname, firstBlood, cit, ce]
        );

        // Credit the wallet IF an economy award callback was injected at
        // mount time. Runs on this same client/transaction so the solve and
        // the payment commit or roll back together.
        const wallet = await awardReward(client, {
            client, teamId, operatorId, nickname, missionId: m.id, cit, ce, firstBlood,
        });

        await client.query('COMMIT');

        rt.broadcastWallet(teamId, wallet);
        rt.broadcastActivity({
            teamName: req.auth.teamName,
            text: firstBlood
                ? `${req.auth.teamName} took DCR FIRST BLOOD on ${m.id}`
                : `${req.auth.teamName} solved DCR ${m.id}`,
            at: new Date().toISOString(),
        });

        res.json({
            correct: true,
            firstBlood,
            reward: { cit, ce },
            credited: true,
            wallet,
            epilogue: m.epilogue || null,
        });
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
        next(err);
    } finally {
        client.release();
    }
});

module.exports = router;
module.exports.setAwardCallback = setAwardCallback;
