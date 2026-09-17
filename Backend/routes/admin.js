const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db_config');
const rt = require('../lib/realtime');
const economy = require('../lib/economy');
const phase = require('../lib/phase');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAdmin);

function handleEconomyError(err, res, next) {
    if (err instanceof economy.EconomyError) {
        return res.status(err.status).json({ error: 'DENIED', message: err.message });
    }
    next(err);
}

// ---------------------------------------------------------------------
// OVERVIEW
// ---------------------------------------------------------------------

router.get('/overview', async (_req, res, next) => {
    try {
        const [totals, gameState, byCategory, itemsSold, timeline] = await Promise.all([
            db.query(
                `SELECT
                    (SELECT COUNT(*)::int FROM teams)                                    AS teams,
                    (SELECT COUNT(*)::int FROM operators)                                AS operators,
                    (SELECT COALESCE(SUM(cit_balance),0)::int FROM teams)                AS circulating,
                    (SELECT COALESCE(SUM(core_energy),0)::int FROM teams)                AS energy_total,
                    (SELECT COALESCE(SUM(amount),0)::int FROM ledger WHERE amount > 0)   AS total_issued,
                    (SELECT COALESCE(-SUM(amount),0)::int FROM ledger WHERE amount < 0)  AS total_spent,
                    (SELECT COUNT(*)::int FROM submissions WHERE is_correct)             AS solves,
                    (SELECT COUNT(*)::int FROM submissions)                              AS attempts,
                    (SELECT COUNT(*)::int FROM team_missions)                            AS missions_bought,
                    (SELECT COUNT(*)::int FROM team_endgame)                             AS endgame_solves,
                    (SELECT COUNT(*)::int FROM notifications
                      WHERE kind = 'URGENT' AND status = 'SENT')                         AS open_urgent,
                    (SELECT COUNT(*)::int FROM sessions
                      WHERE revoked_at IS NULL AND expires_at > NOW())                   AS active_sessions`
            ),
            phase.getStateWithConfig(),
            db.query(
                `SELECT c.category,
                        COUNT(*) FILTER (WHERE s.is_correct)::int AS solves,
                        COUNT(*)::int                             AS attempts
                   FROM submissions s JOIN challenges c ON c.id = s.challenge_id
                  GROUP BY c.category`
            ),
            db.query('SELECT code, name, item_type, units_sold, revenue, teams_owning FROM v_item_popularity ORDER BY units_sold DESC'),
            db.query(
                `SELECT date_trunc('minute', created_at) AS t,
                        SUM(amount) FILTER (WHERE amount > 0)::int  AS earned,
                        -SUM(amount) FILTER (WHERE amount < 0)::int AS spent
                   FROM ledger
                  WHERE created_at > NOW() - INTERVAL '2 hours'
                  GROUP BY 1 ORDER BY 1`
            ),
        ]);

        res.json({
            totals: totals.rows[0],
            phase: gameState,
            byCategory: byCategory.rows,
            itemsSold: itemsSold.rows,
            timeline: timeline.rows,
        });
    } catch (err) { next(err); }
});

router.get('/teams', async (_req, res, next) => {
    try {
        const { rows } = await db.query('SELECT * FROM v_team_stats ORDER BY core_energy DESC, cit_balance DESC');
        res.json(rows);
    } catch (err) { next(err); }
});

router.get('/teams/:id', async (req, res, next) => {
    try {
        const teamId = Number(req.params.id);

        const [stats, items, ledger, missions, operators, sessions, subs, endgame, notifs, access] =
            await Promise.all([
                db.query('SELECT * FROM v_team_stats WHERE id = $1', [teamId]),
                db.query('SELECT * FROM v_team_items WHERE team_id = $1 ORDER BY item_type, name', [teamId]),
                db.query(
                    `SELECT l.id, l.kind, l.amount, l.balance_after, l.energy_delta, l.energy_after,
                            l.quantity, l.note, l.created_at, o.nickname AS operator, i.name AS item_name
                       FROM ledger l
                  LEFT JOIN operators o ON o.id = l.operator_id
                  LEFT JOIN items i     ON i.id = l.item_id
                      WHERE l.team_id = $1
                      ORDER BY l.created_at DESC LIMIT 200`,
                    [teamId]
                ),
                db.query(
                    `SELECT tm.id, tm.status, tm.difficulty, tm.paid_amount, tm.purchased_at,
                            tm.deadline_at, tm.resolved_at, m.mission_name, m.code, mt.reward
                       FROM team_missions tm
                       JOIN missions m ON m.id = tm.mission_id
                  LEFT JOIN mission_tiers mt ON mt.mission_id = tm.mission_id
                                            AND mt.difficulty = tm.difficulty
                      WHERE tm.team_id = $1 ORDER BY tm.purchased_at DESC`,
                    [teamId]
                ),
                db.query('SELECT id, nickname, created_at FROM operators WHERE team_id = $1', [teamId]),
                db.query(
                    `SELECT id, user_agent, ip, created_at, expires_at
                       FROM sessions
                      WHERE team_id = $1 AND revoked_at IS NULL AND expires_at > NOW()
                      ORDER BY created_at DESC`,
                    [teamId]
                ),
                db.query(
                    `SELECT c.code, c.category, c.reward, s.is_correct, s.is_first_blood,
                            s.submitted_at, o.nickname
                       FROM submissions s
                       JOIN challenges c ON c.id = s.challenge_id
                  LEFT JOIN operators o ON o.id = s.operator_id
                      WHERE s.team_id = $1 ORDER BY s.submitted_at DESC LIMIT 100`,
                    [teamId]
                ),
                db.query(
                    `SELECT p.position, p.title, te.solved_at
                       FROM endgame_parts p
                  LEFT JOIN team_endgame te ON te.part_id = p.id AND te.team_id = $1
                      WHERE p.is_active ORDER BY p.position`,
                    [teamId]
                ),
                db.query(
                    `SELECT id, kind, title, body, status, deadline_at, penalty_cit, penalty_energy,
                            reward_cit, acknowledged_at, resolved_at, created_at
                       FROM notifications WHERE team_id = $1
                      ORDER BY created_at DESC LIMIT 50`,
                    [teamId]
                ),
                db.query(
                    `SELECT m.code, m.mission_name, a.method, a.unlocked_at
                       FROM team_mission_access a JOIN missions m ON m.id = a.mission_id
                      WHERE a.team_id = $1 ORDER BY a.unlocked_at DESC`,
                    [teamId]
                ),
            ]);

        if (!stats.rows[0]) return res.status(404).json({ error: 'NOT FOUND' });

        res.json({
            team: stats.rows[0],
            items: items.rows,
            ledger: ledger.rows,
            missions: missions.rows,
            operators: operators.rows,
            sessions: sessions.rows,
            submissions: subs.rows,
            endgame: endgame.rows,
            notifications: notifs.rows,
            missionAccess: access.rows,
        });
    } catch (err) { next(err); }
});

router.get('/items', async (_req, res, next) => {
    try {
        const { rows } = await db.query(
            `SELECT i.*, p.units_sold, p.revenue, p.teams_owning
               FROM items i JOIN v_item_popularity p ON p.id = i.id
              ORDER BY i.item_type, i.cost`
        );
        res.json(rows);
    } catch (err) { next(err); }
});

router.get('/inventory', async (_req, res, next) => {
    try {
        const { rows } = await db.query(
            'SELECT * FROM v_team_items WHERE quantity > 0 ORDER BY team_name, item_type'
        );
        res.json(rows);
    } catch (err) { next(err); }
});

router.get('/ledger', async (req, res, next) => {
    try {
        const limit = Math.min(500, Number(req.query.limit) || 200);
        const kind = req.query.kind || null;
        const { rows } = await db.query(
            `SELECT l.id, l.kind, l.amount, l.balance_after, l.energy_delta, l.energy_after,
                    l.quantity, l.note, l.created_at,
                    t.team_name, o.nickname AS operator, i.name AS item_name
               FROM ledger l
               JOIN teams t      ON t.id = l.team_id
          LEFT JOIN operators o  ON o.id = l.operator_id
          LEFT JOIN items i      ON i.id = l.item_id
              WHERE ($1::text IS NULL OR l.kind = $1)
              ORDER BY l.created_at DESC LIMIT $2`,
            [kind, limit]
        );
        res.json(rows);
    } catch (err) { next(err); }
});

router.get('/challenges', async (_req, res, next) => {
    try {
        const { rows } = await db.query(
            `SELECT c.id, c.code, c.category, c.difficulty, c.reward, c.core_energy,
                    c.first_blood_cit, c.first_blood_energy, c.title, c.is_active,
                    COUNT(s.id) FILTER (WHERE s.is_correct)::int AS solves,
                    COUNT(s.id)::int                             AS attempts,
                    COUNT(DISTINCT s.team_id)::int               AS teams_tried,
                    (SELECT t.team_name FROM submissions fs JOIN teams t ON t.id = fs.team_id
                      WHERE fs.challenge_id = c.id AND fs.is_first_blood) AS first_blood_team
               FROM challenges c LEFT JOIN submissions s ON s.challenge_id = c.id
              GROUP BY c.id ORDER BY c.category, c.difficulty`
        );
        res.json(rows);
    } catch (err) { next(err); }
});

/**
 * GET /api/admin/missions
 * This is the only place `access_code` is ever served. Admins read it off
 * this screen and hand it to a team that has physically reached the spot.
 */
router.get('/missions', async (_req, res, next) => {
    try {
        const { rows } = await db.query(
            `SELECT m.id, m.code, m.mission_name, m.kind, m.position, m.description,
                    m.location_hint, m.coordinates, m.access_code, m.is_active,
                    COALESCE(
                        json_agg(
                            json_build_object(
                                'difficulty', mt.difficulty, 'entryCost', mt.entry_cost,
                                'reward', mt.reward, 'coreEnergy', mt.core_energy,
                                'timeLimitMin', mt.time_limit_min
                            ) ORDER BY CASE mt.difficulty
                                         WHEN 'EASY' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END
                        ) FILTER (WHERE mt.difficulty IS NOT NULL), '[]'
                    ) AS tiers,
                    (SELECT COUNT(*)::int FROM team_missions x WHERE x.mission_id = m.id) AS purchases,
                    (SELECT COUNT(*)::int FROM team_missions x
                      WHERE x.mission_id = m.id AND x.status = 'COMPLETED')               AS completed,
                    (SELECT COUNT(*)::int FROM team_missions x
                      WHERE x.mission_id = m.id AND x.status = 'FAILED')                  AS failed,
                    (SELECT COUNT(*)::int FROM team_missions x
                      WHERE x.mission_id = m.id AND x.status = 'PURCHASED')               AS in_progress,
                    (SELECT COUNT(*)::int FROM team_mission_access a
                      WHERE a.mission_id = m.id)                                          AS teams_unlocked
               FROM missions m
          LEFT JOIN mission_tiers mt ON mt.mission_id = m.id
              GROUP BY m.id ORDER BY m.position, m.id`
        );
        res.json(rows);
    } catch (err) { next(err); }
});

router.get('/missions/pending', async (_req, res, next) => {
    try {
        const { rows } = await db.query(
            `SELECT tm.id, tm.purchased_at, tm.deadline_at, tm.difficulty, tm.paid_amount,
                    t.team_name, t.id AS team_id, m.mission_name, mt.reward, mt.core_energy,
                    EXISTS (
                        SELECT 1 FROM ledger l JOIN items i ON i.id = l.item_id
                         WHERE l.team_id = tm.team_id AND l.mission_id = tm.mission_id
                           AND l.kind = 'ITEM_USE' AND i.code = 'INSURANCE'
                    ) AS insured
               FROM team_missions tm
               JOIN teams t    ON t.id = tm.team_id
               JOIN missions m ON m.id = tm.mission_id
          LEFT JOIN mission_tiers mt ON mt.mission_id = tm.mission_id
                                    AND mt.difficulty = tm.difficulty
              WHERE tm.status = 'PURCHASED'
              ORDER BY tm.deadline_at NULLS LAST, tm.purchased_at`
        );
        res.json(rows);
    } catch (err) { next(err); }
});

/** GET /api/admin/endgame - parts with their codes, and who has solved what. */
router.get('/endgame', async (_req, res, next) => {
    try {
        const { rows } = await db.query(
            `SELECT p.id, p.position, p.title, p.prompt, p.access_code,
                    p.reward_cit, p.reward_energy, p.is_active,
                    COUNT(te.team_id)::int AS teams_solved,
                    COALESCE(
                        json_agg(t.team_name ORDER BY te.solved_at)
                            FILTER (WHERE t.team_name IS NOT NULL), '[]'
                    ) AS solved_by
               FROM endgame_parts p
          LEFT JOIN team_endgame te ON te.part_id = p.id
          LEFT JOIN teams t         ON t.id = te.team_id
              GROUP BY p.id ORDER BY p.position`
        );
        res.json(rows);
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------
// PHASE CONTROL
// ---------------------------------------------------------------------

/** POST /api/admin/phase { phase, durationMin? } */
router.post('/phase', async (req, res, next) => {
    try {
        const { phase: target, durationMin } = req.body || {};
        const state = await phase.setPhase(target, {
            durationMin: durationMin === undefined ? null : Number(durationMin),
        });
        rt.broadcastPhase(state);
        res.json({ success: true, state });
    } catch (err) {
        if (err.status) return res.status(err.status).json({ error: 'BAD REQUEST', message: err.message });
        next(err);
    }
});

/** PATCH /api/admin/phase/:phase/duration { durationMin } */
router.patch('/phase/:phase/duration', async (req, res, next) => {
    try {
        const minutes = Number((req.body || {}).durationMin);
        if (!Number.isInteger(minutes) || minutes <= 0) {
            return res.status(400).json({ error: 'BAD REQUEST', message: 'POSITIVE DURATION REQUIRED.' });
        }
        const row = await phase.setDuration(req.params.phase.toUpperCase(), minutes);
        const state = await phase.getStateWithConfig();
        rt.broadcastPhase(state);
        res.json({ success: true, config: row });
    } catch (err) {
        if (err.status) return res.status(err.status).json({ error: 'BAD REQUEST', message: err.message });
        next(err);
    }
});

// ---------------------------------------------------------------------
// NOTIFICATIONS
// ---------------------------------------------------------------------

/**
 * POST /api/admin/notifications
 * { teamIds: [..] | 'ALL', kind, title, body, minutes?, penaltyCit?,
 *   penaltyEnergy?, rewardCit? }
 */
router.post('/notifications', async (req, res, next) => {
    try {
        const {
            teamIds, kind, title, body,
            minutes, penaltyCit = 0, penaltyEnergy = 0, rewardCit = 200,
        } = req.body || {};

        if (!['NORMAL', 'URGENT'].includes(kind)) {
            return res.status(400).json({ error: 'BAD REQUEST', message: 'KIND MUST BE NORMAL OR URGENT.' });
        }
        if (!title || !body) {
            return res.status(400).json({ error: 'BAD REQUEST', message: 'TITLE AND BODY REQUIRED.' });
        }
        if (kind === 'URGENT' && (!Number.isFinite(Number(minutes)) || Number(minutes) <= 0)) {
            return res.status(400).json({ error: 'BAD REQUEST', message: 'URGENT MESSAGES NEED A COUNTDOWN.' });
        }

        let targets;
        if (teamIds === 'ALL') {
            const { rows } = await db.query('SELECT id FROM teams ORDER BY id');
            targets = rows.map((r) => r.id);
        } else if (Array.isArray(teamIds) && teamIds.length) {
            targets = teamIds.map(Number).filter(Number.isInteger);
        } else {
            return res.status(400).json({ error: 'BAD REQUEST', message: 'SELECT AT LEAST ONE TEAM.' });
        }

        const deadline = kind === 'URGENT'
            ? new Date(Date.now() + Number(minutes) * 60_000)
            : null;

        const sent = [];
        for (const teamId of targets) {
            const { rows } = await db.query(
                `INSERT INTO notifications
                   (team_id, admin_id, kind, title, body, deadline_at,
                    penalty_cit, penalty_energy, reward_cit)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
                 RETURNING *`,
                [teamId, req.auth.adminId, kind, title, body, deadline,
                 kind === 'URGENT' ? Math.max(0, Number(penaltyCit) || 0) : 0,
                 kind === 'URGENT' ? Math.max(0, Number(penaltyEnergy) || 0) : 0,
                 kind === 'URGENT' ? Math.max(0, Number(rewardCit) || 0) : 0]
            );
            rt.broadcastNotification(teamId, rows[0]);
            sent.push(rows[0]);
        }

        res.json({ success: true, sent: sent.length, notifications: sent });
    } catch (err) { next(err); }
});

router.get('/notifications', async (req, res, next) => {
    try {
        const onlyOpen = req.query.open === '1';
        const { rows } = await db.query(
            `SELECT n.*, t.team_name, a.username AS sent_by
               FROM notifications n
               JOIN teams t   ON t.id = n.team_id
          LEFT JOIN admins a  ON a.id = n.admin_id
              WHERE ($1::bool IS FALSE OR n.status = 'SENT')
              ORDER BY n.created_at DESC LIMIT 200`,
            [onlyOpen]
        );
        res.json(rows);
    } catch (err) { next(err); }
});

/** POST /api/admin/notifications/:id/resolve { outcome: COMPLETED | FAILED } */
router.post('/notifications/:id/resolve', async (req, res, next) => {
    try {
        const outcome = (req.body || {}).outcome === 'COMPLETED' ? 'COMPLETED' : 'FAILED';
        const result = await economy.resolveNotification({
            notificationId: Number(req.params.id),
            adminId: req.auth.adminId,
            outcome,
        });
        rt.broadcastWallet(result.teamId, result.wallet);
        rt.broadcastNotificationResolved(result.teamId, {
            notificationId: Number(req.params.id),
            outcome,
            title: result.notification.title,
        });
        res.json({ success: true, ...result });
    } catch (err) { handleEconomyError(err, res, next); }
});

// ---------------------------------------------------------------------
// TEAM ACTIONS
// ---------------------------------------------------------------------

router.post('/missions/:id/resolve', async (req, res, next) => {
    try {
        const outcome = (req.body || {}).outcome === 'COMPLETED' ? 'COMPLETED' : 'FAILED';
        const result = await economy.resolveMission({
            teamMissionId: Number(req.params.id),
            adminId: req.auth.adminId,
            outcome,
        });
        rt.broadcastWallet(result.teamId, result.wallet);
        rt.toTeam(result.teamId, 'mission_resolved', { outcome, missionName: result.missionName });
        res.json({ success: true, ...result });
    } catch (err) { handleEconomyError(err, res, next); }
});

/** POST /api/admin/teams/:id/adjust { amount, energy, note } */
router.post('/teams/:id/adjust', async (req, res, next) => {
    try {
        const { amount = 0, energy = 0, note } = req.body || {};
        if (!Number.isInteger(amount) || !Number.isInteger(energy) || (amount === 0 && energy === 0)) {
            return res.status(400).json({
                error: 'BAD REQUEST',
                message: 'GIVE A NON-ZERO CIT$ OR ENERGY AMOUNT.',
            });
        }
        const result = await economy.adminAdjust({
            teamId: Number(req.params.id),
            adminId: req.auth.adminId,
            amount, energy,
            note: note || 'Manual adjustment',
        });
        rt.broadcastWallet(Number(req.params.id), result.wallet);
        res.json({ success: true, ...result });
    } catch (err) { handleEconomyError(err, res, next); }
});

router.post('/teams/:id/grant-item', async (req, res, next) => {
    try {
        const { itemCode, quantity } = req.body || {};
        const teamId = Number(req.params.id);
        const result = await economy.adminGrantItem({
            teamId, adminId: req.auth.adminId, itemCode,
            quantity: Math.max(1, Number(quantity) || 1),
        });
        rt.broadcastInventory(teamId, result.inventory);
        res.json({ success: true, ...result });
    } catch (err) { handleEconomyError(err, res, next); }
});

/** POST /api/admin/teams/:id/unlock-mission { missionCode } */
router.post('/teams/:id/unlock-mission', async (req, res, next) => {
    try {
        const teamId = Number(req.params.id);
        const result = await economy.adminUnlockMission({
            teamId, missionCode: (req.body || {}).missionCode,
        });
        rt.toTeam(teamId, 'mission_unlocked', { missionCode: result.missionCode });
        res.json({ success: true, ...result });
    } catch (err) { handleEconomyError(err, res, next); }
});

router.post('/teams/:id/lock', async (req, res, next) => {
    try {
        const locked = Boolean((req.body || {}).locked);
        await db.query('UPDATE teams SET is_locked = $1 WHERE id = $2', [locked, Number(req.params.id)]);
        rt.toTeam(Number(req.params.id), 'team_locked', { locked });
        res.json({ success: true, locked });
    } catch (err) { next(err); }
});

router.delete('/sessions/:id', async (req, res, next) => {
    try {
        await db.query('UPDATE sessions SET revoked_at = NOW() WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) { next(err); }
});

/** POST /api/admin/challenges - create or update; the flag is hashed here. */
router.post('/challenges', async (req, res, next) => {
    try {
        const {
            code, category, difficulty, reward, coreEnergy,
            firstBloodCit, firstBloodEnergy, title, description, flag,
        } = req.body || {};
        if (!code || !category || !flag || !title) {
            return res.status(400).json({ error: 'BAD REQUEST', message: 'CODE, CATEGORY, TITLE AND FLAG REQUIRED.' });
        }
        const { rows } = await db.query(
            `INSERT INTO challenges (code, category, difficulty, reward, core_energy,
                                     first_blood_cit, first_blood_energy, title, description, flag_hash)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
             ON CONFLICT (code) DO UPDATE SET
                category = EXCLUDED.category, difficulty = EXCLUDED.difficulty,
                reward = EXCLUDED.reward, core_energy = EXCLUDED.core_energy,
                first_blood_cit = EXCLUDED.first_blood_cit,
                first_blood_energy = EXCLUDED.first_blood_energy,
                title = EXCLUDED.title, description = EXCLUDED.description,
                flag_hash = EXCLUDED.flag_hash
             RETURNING id, code, category, difficulty, reward, core_energy, title`,
            [code, category, difficulty || 1, reward || 50, coreEnergy ?? 5,
             firstBloodCit ?? 0, firstBloodEnergy ?? 0, title, description || null,
             await bcrypt.hash(flag.trim(), 10)]
        );
        res.json({ success: true, challenge: rows[0] });
    } catch (err) { next(err); }
});

router.patch('/challenges/:id/active', async (req, res, next) => {
    try {
        const active = Boolean((req.body || {}).active);
        await db.query('UPDATE challenges SET is_active = $1 WHERE id = $2', [active, Number(req.params.id)]);
        res.json({ success: true, active });
    } catch (err) { next(err); }
});

module.exports = router;
