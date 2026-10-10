// Express router: POST /api/data/query — runs a participant's read-only SQL
// against the DCR data database and returns the result set.
//
// MOUNTING (done by the main agent, OUTSIDE this file):
//   const { requireTeam } = require('./middleware/auth');
//   const phase = require('./lib/phase');
//   app.use('/api/data', requireTeam, phase.requirePhase('CHALLENGES'), require('./routes/dcrQuery'));
//
// Assumes req.auth = { teamId, teamName, operatorId, nickname } (like
// routes/game.js) and that the Challenge-phase guard is applied at mount.
//
// ENV: DCR_DATABASE_URL — the connection string of the `dcr_reader` role
// (read-only, search_path = dcr_view). NEVER point this at the owner role
// or at the game database.
//
// The query log is written to the GAME database (dcr_query_log). An
// app-level pool override wins, else the shared db_config pool is used.
const express = require('express');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const db = require('../db_config');

// Dedicated read-only pool. Kept small: the reader role has CONNECTION LIMIT 20.
const readerPool = new Pool({ connectionString: process.env.DCR_DATABASE_URL, max: 10 });
const router = express.Router();

const gamePool = (req) => req.app.get('gamePool') || db.pool;

const MAX_ROWS = 200;
const MAX_SQL_LENGTH = 4000;
// Belt-and-braces: the reader role is already read-only, but we also refuse
// anything that could probe internals or escape the single-SELECT contract.
const FORBIDDEN = /\b(pg_[a-z_]+|information_schema|current_setting|set_config|lo_[a-z]+|dblink|copy|do|call|listen|notify)\b/i;

const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30, // 30 queries / minute / team
    keyGenerator: (req) => `dcr_q_${req.auth.teamId}`, // behind auth, so req.auth always exists
    standardHeaders: true,
});

function validate(sqlRaw) {
    if (typeof sqlRaw !== 'string') return 'SQL must be text.';
    const sql = sqlRaw.trim().replace(/;\s*$/, '');
    if (!sql) return 'Empty query.';
    if (sql.length > MAX_SQL_LENGTH) return 'Query too long.';
    if (sql.includes(';')) return 'One statement only.';
    if (/--|\/\*/.test(sql)) return 'Comments are not allowed.';
    if (!/^(select|with)\b/i.test(sql)) return 'Only SELECT queries are allowed.';
    if (FORBIDDEN.test(sql)) return 'This keyword or function is not allowed.';
    return null;
}

router.post('/query', limiter, async (req, res, next) => {
    const sql = req.body?.sql;
    const err = validate(sql);
    if (err) return res.status(400).json({ error: 'BAD REQUEST', message: err });
    const clean = sql.trim().replace(/;\s*$/, '');

    let client;
    try {
        client = await readerPool.connect();
    } catch (e) {
        // A missing / unreachable DCR_DATABASE_URL should not look like a
        // participant mistake, so surface it as a server error.
        return next(e);
    }

    const started = Date.now();
    let logOk = false;
    try {
        await client.query('BEGIN READ ONLY');
        await client.query("SET LOCAL statement_timeout = '5s'");
        // Wrapping caps the row count without rewriting the player's query.
        const r = await client.query(`SELECT * FROM (${clean}) AS q LIMIT ${MAX_ROWS + 1}`);
        await client.query('ROLLBACK');
        logOk = true;
        const truncated = r.rows.length > MAX_ROWS;
        res.json({
            columns: r.fields.map((f) => f.name),
            rows: truncated ? r.rows.slice(0, MAX_ROWS) : r.rows,
            truncated,
            ms: Date.now() - started,
        });
    } catch (e) {
        try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
        // The SQL error is useful for learning; cap it and never leak internals.
        res.status(400).json({ error: 'QUERY ERROR', message: String(e.message).slice(0, 300) });
    } finally {
        client.release();
        // The query log lives in the GAME database (the reader role cannot
        // write). A logging failure must never block the player.
        const gp = gamePool(req);
        if (gp) {
            gp.query(
                'INSERT INTO dcr_query_log (team_id, nickname, sql_text, ok, ms) VALUES ($1,$2,$3,$4,$5)',
                [req.auth.teamId, req.auth.nickname, clean.slice(0, 4000), logOk, Date.now() - started]
            ).catch(() => { /* best effort */ });
        }
    }
});

module.exports = router;
