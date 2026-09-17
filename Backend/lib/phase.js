const db = require('./../db_config');

/**
 * One phase is playable at a time. The operator app greys out the other
 * tabs, but that is only cosmetic — this module is what actually refuses
 * the request, so a team poking the API directly gains nothing.
 *
 * LOBBY is the starting state: everything is locked.
 */
const PHASES = ['LOBBY', 'CHALLENGES', 'MISSIONS', 'ENDGAME', 'CLOSED'];
const PLAYABLE = ['CHALLENGES', 'MISSIONS', 'ENDGAME'];

async function getState() {
    const { rows } = await db.query(
        'SELECT phase, phase_started_at, phase_ends_at FROM game_state WHERE id = 1'
    );
    return rows[0];
}

/** Phase + its configured durations, for both the operator and admin UIs. */
async function getStateWithConfig() {
    const [state, config] = await Promise.all([
        getState(),
        db.query('SELECT phase, duration_min, label FROM phase_config ORDER BY phase'),
    ]);
    return { ...state, config: config.rows };
}

/**
 * Switches the active phase and restarts its countdown from the configured
 * duration. LOBBY and CLOSED have no timer.
 */
async function setPhase(phase, { durationMin = null } = {}) {
    if (!PHASES.includes(phase)) {
        const err = new Error('UNKNOWN PHASE.');
        err.status = 400;
        throw err;
    }

    let minutes = durationMin;
    if (minutes === null && PLAYABLE.includes(phase)) {
        const { rows } = await db.query('SELECT duration_min FROM phase_config WHERE phase = $1', [phase]);
        minutes = rows[0] ? rows[0].duration_min : null;
    }

    const { rows } = await db.query(
        `UPDATE game_state
            SET phase = $1,
                phase_started_at = CASE WHEN $2::int IS NULL THEN NULL ELSE NOW() END,
                phase_ends_at    = CASE WHEN $2::int IS NULL THEN NULL
                                        ELSE NOW() + ($2 || ' minutes')::interval END,
                updated_at = NOW()
          WHERE id = 1
        RETURNING phase, phase_started_at, phase_ends_at`,
        [phase, minutes]
    );
    return rows[0];
}

/** Changes a phase's default duration without switching to it. */
async function setDuration(phase, durationMin) {
    const { rows } = await db.query(
        'UPDATE phase_config SET duration_min = $2 WHERE phase = $1 RETURNING *',
        [phase, durationMin]
    );
    if (!rows[0]) {
        const err = new Error('UNKNOWN PHASE.');
        err.status = 400;
        throw err;
    }
    return rows[0];
}

/**
 * Express guard. `requirePhase('MISSIONS')` rejects anything sent while
 * another phase is running, and says which one is actually open.
 */
function requirePhase(required) {
    return async (req, res, next) => {
        try {
            const state = await getState();
            if (state.phase !== required) {
                return res.status(423).json({
                    error: 'PHASE LOCKED',
                    message:
                        state.phase === 'LOBBY'
                            ? 'THE PROTOCOL HAS NOT STARTED. STAND BY, OPERATOR.'
                            : state.phase === 'CLOSED'
                              ? 'THE NETWORK IS CLOSED. NO FURTHER ACTION POSSIBLE.'
                              : `THIS PHASE IS SEALED. ${state.phase} IS CURRENTLY ACTIVE.`,
                    activePhase: state.phase,
                });
            }
            if (state.phase_ends_at && new Date(state.phase_ends_at) <= new Date()) {
                return res.status(423).json({
                    error: 'PHASE EXPIRED',
                    message: 'TIME IS UP FOR THIS PHASE.',
                    activePhase: state.phase,
                });
            }
            next();
        } catch (err) { next(err); }
    };
}

module.exports = { PHASES, PLAYABLE, getState, getStateWithConfig, setPhase, setDuration, requirePhase };
