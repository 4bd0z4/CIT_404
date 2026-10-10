/**
 * Public, read-only scoreboard data for the venue projector.
 *
 * Exposes only what every team already sees on the in-game leaderboard:
 * team names, Core Energy, solve counts, first bloods, and the energy
 * progression. No wallets, inventory, flags, codes or member names.
 *
 * Results are cached for a few seconds so a projector (or a crowd refreshing
 * the page) cannot put meaningful load on the database.
 */
const express = require('express');
const db = require('../db_config');

const router = express.Router();
const TTL_MS = 5000;
const cache = new Map();

async function cached(key, loader) {
    const hit = cache.get(key);
    const now = Date.now();
    if (hit && now - hit.at < TTL_MS) return hit.value;
    const value = await loader();
    cache.set(key, { at: now, value });
    return value;
}

router.get('/leaderboard', async (_req, res, next) => {
    try {
        const rows = await cached('leaderboard', async () => {
            const r = await db.query(
                `SELECT team_name, core_energy, total_solved, first_bloods,
                        missions_completed, rank
                   FROM v_leaderboard ORDER BY rank LIMIT 20`
            );
            return r.rows;
        });
        res.json(rows);
    } catch (err) { next(err); }
});

router.get('/score-history', async (_req, res, next) => {
    try {
        const series = await cached('score-history', async () => {
            const { rows } = await db.query(
                `WITH top AS (
                     SELECT t.id, t.team_name
                       FROM v_leaderboard v JOIN teams t ON t.team_name = v.team_name
                      ORDER BY v.rank LIMIT 10
                 )
                 SELECT top.team_name, l.created_at AS t, l.energy_after AS score
                   FROM top
                   JOIN ledger l ON l.team_id = top.id
                  WHERE l.energy_delta <> 0
                  ORDER BY top.team_name, l.created_at`
            );
            const byTeam = new Map();
            for (const r of rows) {
                if (!byTeam.has(r.team_name)) byTeam.set(r.team_name, []);
                byTeam.get(r.team_name).push({ t: new Date(r.t).getTime(), score: r.score });
            }
            return [...byTeam.entries()].map(([name, points]) => ({ name, points }));
        });
        res.json(series);
    } catch (err) { next(err); }
});

module.exports = router;
