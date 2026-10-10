const { verifyAccessToken } = require('../lib/tokens');

/** Pulls `Authorization: Bearer <jwt>` off the request, if present. */
function bearerToken(req) {
    const header = req.get('authorization') || '';
    return header.startsWith('Bearer ') ? header.slice(7) : null;
}

/** Populates req.auth when a valid access token is present. Never rejects. */
function attachAuth(req, _res, next) {
    const token = bearerToken(req);
    if (token) {
        try {
            req.auth = verifyAccessToken(token);
        } catch {
            req.auth = null;
        }
    }
    next();
}

/** Requires any authenticated subject. */
function requireAuth(req, res, next) {
    if (!req.auth) {
        return res.status(401).json({ error: 'ACCESS DENIED', message: 'AUTHENTICATION REQUIRED.' });
    }
    next();
}

/** Requires a team (operator) token. */
function requireTeam(req, res, next) {
    if (!req.auth || req.auth.kind !== 'team') {
        return res.status(401).json({ error: 'ACCESS DENIED', message: 'OPERATOR CREDENTIALS REQUIRED.' });
    }
    next();
}

/** Requires an admin token. */
function requireAdmin(req, res, next) {
    if (!req.auth || req.auth.kind !== 'admin') {
        return res.status(403).json({ error: 'ACCESS DENIED', message: 'ADMIN CLEARANCE REQUIRED.' });
    }
    next();
}

/** Requires one of the listed admin roles. */
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.auth || req.auth.kind !== 'admin' || !roles.includes(req.auth.role)) {
            return res.status(403).json({ error: 'ACCESS DENIED', message: 'INSUFFICIENT CLEARANCE.' });
        }
        next();
    };
}

const requireSuperAdmin = requireRole('superadmin');
const requireMissionStaff = requireRole('mission_admin', 'superadmin');

/** Socket.IO handshake guard - same token, same rules. */
function socketAuth(socket, next) {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token) return next(new Error('AUTHENTICATION REQUIRED'));
    try {
        socket.data.auth = verifyAccessToken(token);
        next();
    } catch {
        next(new Error('INVALID TOKEN'));
    }
}

module.exports = {
    attachAuth, requireAuth, requireTeam, requireAdmin,
    requireRole, requireSuperAdmin, requireMissionStaff, socketAuth,
};
