const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../db_config');
const rt = require('../lib/realtime');
const economy = require('../lib/economy');
const phase = require('../lib/phase');
const { requireTeam } = require('../middleware/auth');

const router = express.Router();
router.use(requireTeam);

/** Anything code-guessable is throttled per team, not per IP. */
function teamLimiter(limit) {
    return rateLimit({
        windowMs: 60 * 1000,
        limit,
        keyGenerator: (req) => `team_${req.auth.teamId}`,
        message: { error: 'THROTTLED', message: 'TOO MANY ATTEMPTS. SLOW DOWN.' },
    });
}

function handleEconomyError(err, res, next) {
    if (err instanceof economy.EconomyError) {
        return res.status(err.status).json({ error: 'DENIED', message: err.message });
    }
    next(err);
}

/** GET /api/game/state - everything the operator app needs on boot. */
router.get('/state', async (req, res, next) => {
    try {
        const { teamId } = req.auth;

        const [team, gameState, inventory, solved, missions, endgame, notifs] = await Promise.all([
            db.query('SELECT id, team_name, cit_balance, core_energy FROM teams WHERE id = $1', [teamId]),
            phase.getStateWithConfig(),
            economy.getInventory(db, teamId),
            db.query(
                `SELECT c.id, c.code, c.category FROM submissions s
                   JOIN challenges c ON c.id = s.challenge_id
                  WHERE s.team_id = $1 AND s.is_correct`,
                [teamId]
            ),
            db.query(
                `SELECT tm.id, tm.status, tm.difficulty, tm.paid_amount,
                        tm.purchased_at, tm.deadline_at, m.code, m.mission_name
                   FROM team_missions tm
                   JOIN missions m ON m.id = tm.mission_id
                  WHERE tm.team_id = $1
                  ORDER BY tm.purchased_at DESC`,
                [teamId]
            ),
            db.query(
                `SELECT (SELECT COUNT(*)::int FROM team_endgame WHERE team_id = $1) AS solved,
                        (SELECT COUNT(*)::int FROM endgame_parts WHERE is_active)    AS total`,
                [teamId]
            ),
            db.query(
                // The cast goes after FILTER, not before: `COUNT(*)::int FILTER`
                // is a syntax error in PostgreSQL.
                `SELECT COUNT(*) FILTER (WHERE read_at IS NULL AND kind = 'NORMAL')::int AS unread,
                        COUNT(*) FILTER (WHERE kind = 'URGENT' AND status = 'SENT'
                                         AND acknowledged_at IS NULL)::int              AS pending_urgent
                   FROM notifications WHERE team_id = $1`,
                [teamId]
            ),
        ]);

        res.json({
            team: team.rows[0],
            phase: gameState,
            inventory,
            solvedChallenges: solved.rows,
            missions: missions.rows,
            endgame: endgame.rows[0],
            notifications: notifs.rows[0],
        });
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------
// PHASE : CHALLENGES
// ---------------------------------------------------------------------

/** GET /api/game/challenges - never returns flag_hash. */
router.get('/challenges', async (req, res, next) => {
    try {
        const state = await phase.getState();
        if (state.phase !== 'CHALLENGES') {
            return res.json({ locked: true, activePhase: state.phase, challenges: [] });
        }

        const { rows } = await db.query(
            `SELECT c.id, c.code, c.category, c.difficulty, c.reward, c.core_energy,
                    c.first_blood_cit, c.first_blood_energy, c.title, c.description,
                    EXISTS (
                        SELECT 1 FROM submissions s
                         WHERE s.challenge_id = c.id AND s.team_id = $1 AND s.is_correct
                    ) AS solved,
                    EXISTS (
                        SELECT 1 FROM submissions s
                         WHERE s.challenge_id = c.id AND s.is_first_blood
                    ) AS first_blood_taken
               FROM challenges c
              WHERE c.is_active
              ORDER BY c.category, c.difficulty, c.code`,
            [req.auth.teamId]
        );
        res.json({ locked: false, challenges: rows });
    } catch (err) { next(err); }
});

/** POST /api/game/submit-flag */
router.post('/submit-flag', phase.requirePhase('CHALLENGES'), teamLimiter(15), async (req, res, next) => {
    try {
        const { challengeCode, flag } = req.body || {};
        if (!challengeCode || !flag) {
            return res.status(400).json({ error: 'BAD REQUEST', message: 'CHALLENGE AND FLAG REQUIRED.' });
        }

        const { rows } = await db.query(
            'SELECT * FROM challenges WHERE code = $1 AND is_active',
            [challengeCode]
        );
        const challenge = rows[0];
        if (!challenge) return res.status(404).json({ error: 'NOT FOUND', message: 'CHALLENGE OFFLINE.' });

        const correct = await bcrypt.compare(flag.trim(), challenge.flag_hash);
        if (!correct) {
            await db.query(
                'INSERT INTO submissions (team_id, challenge_id, operator_id, is_correct) VALUES ($1,$2,$3,FALSE)',
                [req.auth.teamId, challenge.id, req.auth.operatorId]
            );
            return res.status(400).json({ success: false, message: 'INVALID FLAG OR CORRUPTED DATA.' });
        }

        const result = await economy.creditChallenge({
            teamId: req.auth.teamId,
            operatorId: req.auth.operatorId,
            challengeId: challenge.id,
        });

        rt.broadcastWallet(req.auth.teamId, result.wallet);
        rt.broadcastActivity({
            teamName: result.teamName,
            text: result.isFirstBlood
                ? `${result.teamName} took FIRST BLOOD on ${challenge.code}`
                : `${result.teamName} recovered ${challenge.code}`,
            at: new Date().toISOString(),
        });

        res.json({
            success: true,
            reward: result.reward,
            energy: result.energy,
            isFirstBlood: result.isFirstBlood,
            bonus: result.bonus,
            challenge: result.challenge,
            wallet: result.wallet,
        });
    } catch (err) { handleEconomyError(err, res, next); }
});

// ---------------------------------------------------------------------
// THE MARKETPLACE - open in every playable phase
// ---------------------------------------------------------------------

/** GET /api/game/items - catalogue + how many this team already holds. */
router.get('/items', async (req, res, next) => {
    try {
        const { rows } = await db.query(
            `SELECT i.id, i.code, i.name, i.item_type, i.cost, i.icon, i.effect,
                    i.payload, i.applies_to, i.max_per_team, i.stock,
                    COALESCE(ti.quantity, 0)     AS owned,
                    COALESCE(ti.total_bought, 0) AS total_bought
               FROM items i
          LEFT JOIN team_inventory ti ON ti.item_id = i.id AND ti.team_id = $1
              WHERE i.is_active
              ORDER BY i.item_type, i.cost`,
            [req.auth.teamId]
        );
        res.json(rows);
    } catch (err) { next(err); }
});

router.get('/inventory', async (req, res, next) => {
    try {
        res.json(await economy.getInventory(db, req.auth.teamId));
    } catch (err) { next(err); }
});

router.post('/items/purchase', async (req, res, next) => {
    try {
        const { itemCode, quantity } = req.body || {};
        const result = await economy.purchaseItem({
            teamId: req.auth.teamId,
            operatorId: req.auth.operatorId,
            itemCode,
            quantity: Math.max(1, Math.min(10, Number(quantity) || 1)),
        });

        rt.broadcastWallet(req.auth.teamId, result.wallet);
        rt.broadcastInventory(req.auth.teamId, result.inventory);
        rt.broadcastActivity({
            teamName: result.teamName,
            text: `${result.teamName} acquired ${result.item.name}`,
            at: new Date().toISOString(),
        });

        res.json({ success: true, ...result });
    } catch (err) { handleEconomyError(err, res, next); }
});

/**
 * POST /api/game/items/use
 * `missionCode` is optional: present when the item is spent from a mission
 * panel, absent when it is used straight from the inventory.
 */
router.post('/items/use', async (req, res, next) => {
    try {
        const { itemCode, missionCode } = req.body || {};
        const result = await economy.useItem({
            teamId: req.auth.teamId,
            operatorId: req.auth.operatorId,
            itemCode,
            missionCode: missionCode || null,
        });
        rt.broadcastInventory(req.auth.teamId, result.inventory);
        res.json({ success: true, ...result });
    } catch (err) { handleEconomyError(err, res, next); }
});

// ---------------------------------------------------------------------
// PHASE : MISSIONS
// ---------------------------------------------------------------------

/**
 * GET /api/game/missions
 * Returns tiers, the location hint and whether this team has unlocked the
 * mission. Never returns `access_code`, and only returns `coordinates`
 * once the team has actually spent a Location Coordinates item on it.
 */
router.get('/missions', async (req, res, next) => {
    try {
        const state = await phase.getState();
        if (state.phase !== 'MISSIONS') {
            return res.json({ locked: true, activePhase: state.phase, missions: [] });
        }

        const { rows } = await db.query(
            `SELECT m.id, m.code, m.mission_name, m.kind, m.description, m.location_hint, m.position,
                    (tma.team_id IS NOT NULL) AS unlocked,
                    CASE WHEN coord.team_id IS NOT NULL THEN m.coordinates END AS coordinates,
                    tm.status     AS team_status,
                    tm.difficulty AS team_difficulty,
                    tm.deadline_at,
                    COALESCE(
                        json_agg(
                            json_build_object(
                                'difficulty',  mt.difficulty,
                                'entryCost',   mt.entry_cost,
                                'reward',      mt.reward,
                                'coreEnergy',  mt.core_energy,
                                'timeLimitMin', mt.time_limit_min
                            ) ORDER BY CASE mt.difficulty
                                         WHEN 'EASY' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END
                        ) FILTER (WHERE mt.difficulty IS NOT NULL), '[]'
                    ) AS tiers
               FROM missions m
          LEFT JOIN mission_tiers mt ON mt.mission_id = m.id
          LEFT JOIN team_mission_access tma
                 ON tma.mission_id = m.id AND tma.team_id = $1
          LEFT JOIN team_missions tm
                 ON tm.mission_id = m.id AND tm.team_id = $1
                AND tm.status IN ('PURCHASED','COMPLETED')
          LEFT JOIN LATERAL (
                    SELECT l.team_id FROM ledger l JOIN items i ON i.id = l.item_id
                     WHERE l.team_id = $1 AND l.mission_id = m.id
                       AND l.kind = 'ITEM_USE' AND i.code = 'ACCESS_COORD'
                     LIMIT 1
               ) coord ON TRUE
              WHERE m.is_active
              GROUP BY m.id, tma.team_id, coord.team_id, tm.status, tm.difficulty, tm.deadline_at
              ORDER BY m.position, m.id`,
            [req.auth.teamId]
        );
        res.json({ locked: false, missions: rows });
    } catch (err) { next(err); }
});

/** POST /api/game/missions/unlock - the code an admin reads out on site. */
router.post('/missions/unlock', phase.requirePhase('MISSIONS'), teamLimiter(12), async (req, res, next) => {
    try {
        const { missionCode, code } = req.body || {};
        const result = await economy.unlockMission({
            teamId: req.auth.teamId,
            operatorId: req.auth.operatorId,
            missionCode,
            code,
        });
        rt.toTeam(req.auth.teamId, 'mission_unlocked', { missionCode: result.missionCode });
        res.json({ success: true, ...result });
    } catch (err) { handleEconomyError(err, res, next); }
});

/** POST /api/game/missions/purchase */
router.post('/missions/purchase', phase.requirePhase('MISSIONS'), async (req, res, next) => {
    try {
        const { missionCode, difficulty } = req.body || {};
        if (!['EASY', 'MEDIUM', 'HARD'].includes(difficulty)) {
            return res.status(400).json({ error: 'BAD REQUEST', message: 'CHOOSE A DIFFICULTY.' });
        }

        const result = await economy.purchaseMission({
            teamId: req.auth.teamId,
            operatorId: req.auth.operatorId,
            missionCode,
            difficulty,
        });

        rt.broadcastWallet(req.auth.teamId, result.wallet);
        rt.broadcastActivity({
            teamName: result.teamName,
            text: `${result.teamName} deployed on ${result.mission.mission_name} (${difficulty})`,
            at: new Date().toISOString(),
        });

        res.json({ success: true, ...result });
    } catch (err) { handleEconomyError(err, res, next); }
});

// ---------------------------------------------------------------------
// PHASE : ENDGAME
// ---------------------------------------------------------------------

/**
 * GET /api/game/endgame
 * Story fragments are only sent for parts this team has already solved:
 * the twist must not be readable from the network tab.
 */
router.get('/endgame', async (req, res, next) => {
    try {
        const state = await phase.getState();
        if (state.phase !== 'ENDGAME') {
            return res.json({ locked: true, activePhase: state.phase, parts: [], progress: null });
        }

        const { rows } = await db.query(
            `SELECT p.id, p.position, p.title, p.prompt, p.reward_cit, p.reward_energy,
                    (te.team_id IS NOT NULL) AS solved,
                    te.solved_at,
                    CASE WHEN te.team_id IS NOT NULL THEN p.story_fragment END AS story_fragment
               FROM endgame_parts p
          LEFT JOIN team_endgame te ON te.part_id = p.id AND te.team_id = $1
              WHERE p.is_active
              ORDER BY p.position`,
            [req.auth.teamId]
        );

        const solved = rows.filter((r) => r.solved).length;
        res.json({
            locked: false,
            parts: rows,
            progress: { solved, total: rows.length },
        });
    } catch (err) { next(err); }
});

/** POST /api/game/endgame/solve */
router.post('/endgame/solve', phase.requirePhase('ENDGAME'), teamLimiter(15), async (req, res, next) => {
    try {
        const { position, code } = req.body || {};
        const result = await economy.solveEndgamePart({
            teamId: req.auth.teamId,
            operatorId: req.auth.operatorId,
            position: Number(position),
            code,
        });

        rt.broadcastWallet(req.auth.teamId, result.wallet);
        rt.broadcastActivity({
            teamName: result.teamName,
            text: `${result.teamName} recovered ${result.part.title}`,
            at: new Date().toISOString(),
        });

        res.json({ success: true, ...result });
    } catch (err) { handleEconomyError(err, res, next); }
});

// ---------------------------------------------------------------------
// NOTIFICATIONS - messages from the admins
// ---------------------------------------------------------------------

router.get('/notifications', async (req, res, next) => {
    try {
        const { rows } = await db.query(
            `SELECT id, kind, title, body, deadline_at, penalty_cit, penalty_energy,
                    reward_cit, status, read_at, acknowledged_at, resolved_at, created_at
               FROM notifications
              WHERE team_id = $1
              ORDER BY created_at DESC
              LIMIT 50`,
            [req.auth.teamId]
        );
        res.json(rows);
    } catch (err) { next(err); }
});

/** POST /api/game/notifications/:id/read - a normal message was opened. */
router.post('/notifications/:id/read', async (req, res, next) => {
    try {
        await db.query(
            'UPDATE notifications SET read_at = COALESCE(read_at, NOW()) WHERE id = $1 AND team_id = $2',
            [Number(req.params.id), req.auth.teamId]
        );
        res.json({ success: true });
    } catch (err) { next(err); }
});

/**
 * POST /api/game/notifications/:id/ack
 * The operator dismissed the blocking urgent modal. This only records that
 * they saw it — the reward or penalty is still decided by the admin or by
 * the deadline, so acknowledging is not a way to escape the consequence.
 */
router.post('/notifications/:id/ack', async (req, res, next) => {
    try {
        const { rows } = await db.query(
            `UPDATE notifications SET acknowledged_at = COALESCE(acknowledged_at, NOW())
              WHERE id = $1 AND team_id = $2
            RETURNING id, acknowledged_at`,
            [Number(req.params.id), req.auth.teamId]
        );
        if (!rows[0]) return res.status(404).json({ error: 'NOT FOUND' });
        rt.toAdmins('notification_ack', { teamId: req.auth.teamId, notificationId: rows[0].id });
        res.json({ success: true });
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------
// PUBLIC READ-ONLY
// ---------------------------------------------------------------------

router.get('/ledger', async (req, res, next) => {
    try {
        const { rows } = await db.query(
            `SELECT l.id, l.kind, l.amount, l.balance_after, l.energy_delta, l.energy_after,
                    l.quantity, l.note, l.created_at, o.nickname AS operator
               FROM ledger l
          LEFT JOIN operators o ON o.id = l.operator_id
              WHERE l.team_id = $1
              ORDER BY l.created_at DESC
              LIMIT 100`,
            [req.auth.teamId]
        );
        res.json(rows);
    } catch (err) { next(err); }
});

router.get('/leaderboard', async (_req, res, next) => {
    try {
        const { rows } = await db.query(
            `SELECT team_name, core_energy, total_solved, first_bloods,
                    missions_completed, endgame_solved, endgame_total, rank
               FROM v_leaderboard ORDER BY rank LIMIT 20`
        );
        res.json(rows);
    } catch (err) { next(err); }
});

router.get('/feed', async (_req, res, next) => {
    try {
        const { rows } = await db.query(
            `SELECT t.team_name, l.kind, l.note, l.created_at
               FROM ledger l JOIN teams t ON t.id = l.team_id
              WHERE l.kind IN ('CHALLENGE_REWARD','FIRST_BLOOD','ITEM_PURCHASE',
                               'MISSION_PURCHASE','MISSION_REWARD','ENDGAME_REWARD')
              ORDER BY l.created_at DESC LIMIT 15`
        );
        res.json(rows);
    } catch (err) { next(err); }
});

module.exports = router;
