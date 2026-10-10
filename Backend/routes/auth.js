const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../db_config');
const {
    signAccessToken, createSession, findSession, rotateSession, revokeSession,
    REFRESH_COOKIE, refreshCookieOptions,
} = require('../lib/tokens');

const router = express.Router();

/**
 * Brute force is the realistic threat, but all operators at the venue share
 * one public IP (NAT), so an IP-keyed limiter would throttle the whole room.
 * Instead we key by the identity being authenticated — the team name (or the
 * admin username) — so each account gets its own budget regardless of how
 * many people are behind the same IP. Brute-forcing a specific team's code is
 * still capped; other teams are unaffected. A generous ceiling absorbs three
 * operators logging in plus reconnects, while 8-char codes over a 32-symbol
 * alphabet keep the brute-force space astronomically larger than the limit.
 */
const loginLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => {
        const id = (req.body && (req.body.teamName || req.body.username) || '').toString().trim().toLowerCase();
        return id ? `id:${id}` : `ip:${req.ip}`;
    },
    message: { error: 'TOO MANY ATTEMPTS', message: 'CONNECTION THROTTLED BY THE CORE.' },
});

function issue(res, { subject, refreshToken }) {
    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
    return res.json({ accessToken: signAccessToken(subject), subject });
}

/**
 * POST /api/auth/team
 * The three operators of a team share one account. Each person types their
 * own nickname (for attribution) plus the team's join code (the secret).
 */
router.post('/team', loginLimiter, async (req, res, next) => {
    try {
        const { teamName, joinCode, nickname } = req.body || {};
        if (!teamName || !joinCode || !nickname) {
            return res.status(400).json({ error: 'BAD REQUEST', message: 'TEAM, CODE AND CALLSIGN REQUIRED.' });
        }

        const { rows } = await db.query('SELECT * FROM teams WHERE team_name = $1', [teamName]);
        const team = rows[0];

        // Compare against a dummy hash when the team is unknown so the
        // response time does not reveal whether the team exists.
        const hash = team ? team.join_code_hash : '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
        const ok = await bcrypt.compare(joinCode, hash);
        if (!team || !ok) {
            return res.status(401).json({ error: 'ACCESS DENIED', message: 'INVALID TEAM CREDENTIALS.' });
        }
        if (team.is_locked) {
            return res.status(423).json({ error: 'LOCKED', message: 'TEAM ACCOUNT FROZEN BY THE CORE.' });
        }

        const { rows: opRows } = await db.query(
            `INSERT INTO operators (team_id, nickname) VALUES ($1, $2)
             ON CONFLICT (team_id, nickname) DO UPDATE SET nickname = EXCLUDED.nickname
             RETURNING id, nickname`,
            [team.id, nickname.trim().slice(0, 32)]
        );
        const operator = opRows[0];

        const { refreshToken } = await createSession({
            subjectType: 'team', teamId: team.id, operatorId: operator.id, req,
        });

        return issue(res, {
            refreshToken,
            subject: {
                kind: 'team',
                teamId: team.id,
                teamName: team.team_name,
                operatorId: operator.id,
                nickname: operator.nickname,
            },
        });
    } catch (err) { next(err); }
});

/** POST /api/auth/admin - supervision platform login. */
router.post('/admin', loginLimiter, async (req, res, next) => {
    try {
        const { username, password } = req.body || {};
        if (!username || !password) {
            return res.status(400).json({ error: 'BAD REQUEST', message: 'CREDENTIALS REQUIRED.' });
        }

        const { rows } = await db.query('SELECT * FROM admins WHERE username = $1', [username]);
        const admin = rows[0];
        const hash = admin ? admin.password_hash : '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
        const ok = await bcrypt.compare(password, hash);
        if (!admin || !ok) {
            return res.status(401).json({ error: 'ACCESS DENIED', message: 'INVALID ADMIN CREDENTIALS.' });
        }

        const { refreshToken } = await createSession({ subjectType: 'admin', adminId: admin.id, req });

        return issue(res, {
            refreshToken,
            subject: { kind: 'admin', adminId: admin.id, username: admin.username, role: admin.role },
        });
    } catch (err) { next(err); }
});

/**
 * POST /api/auth/refresh
 * Rotates the refresh token and mints a new 15-minute access token.
 * Called silently by the React app; the operators never see it.
 */
router.post('/refresh', async (req, res, next) => {
    try {
        const raw = req.cookies[REFRESH_COOKIE];
        const session = await findSession(raw);
        if (!session) {
            return res.status(401).json({ error: 'SESSION EXPIRED', message: 'RECONNECT REQUIRED.' });
        }

        let subject;
        if (session.subject_type === 'team') {
            const { rows } = await db.query(
                `SELECT t.id, t.team_name, t.is_locked, o.id AS operator_id, o.nickname
                   FROM teams t
              LEFT JOIN operators o ON o.id = $2
                  WHERE t.id = $1`,
                [session.team_id, session.operator_id]
            );
            if (!rows[0] || rows[0].is_locked) {
                return res.status(423).json({ error: 'LOCKED', message: 'TEAM ACCOUNT FROZEN.' });
            }
            subject = {
                kind: 'team',
                teamId: rows[0].id,
                teamName: rows[0].team_name,
                operatorId: rows[0].operator_id,
                nickname: rows[0].nickname,
            };
        } else {
            const { rows } = await db.query('SELECT * FROM admins WHERE id = $1', [session.admin_id]);
            if (!rows[0]) return res.status(401).json({ error: 'ACCESS DENIED' });
            subject = { kind: 'admin', adminId: rows[0].id, username: rows[0].username, role: rows[0].role };
        }

        const refreshToken = await rotateSession(session, req);
        return issue(res, { refreshToken, subject });
    } catch (err) { next(err); }
});

/** POST /api/auth/logout - revokes this device only. */
router.post('/logout', async (req, res, next) => {
    try {
        await revokeSession(req.cookies[REFRESH_COOKIE]);
        res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
        res.json({ ok: true });
    } catch (err) { next(err); }
});

module.exports = router;
