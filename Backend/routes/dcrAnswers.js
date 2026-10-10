// Shared answer-hashing helpers for the DCR module.
//
// The plaintext answers never live in the repository. The seed script turns
// them into HMAC-SHA256 digests with a server-side pepper (ANSWER_PEPPER),
// and this module recomputes the same digest at submission time so the two
// can be compared without ever storing or logging the answer itself.
//
// routes/dcr.js and scripts/seedDcr.js MUST import this module so the two
// algorithms stay identical; a mismatch would make every answer wrong.
const crypto = require('crypto');

/** Collapse whitespace and case so "  Node 01 " and "node 01" compare equal. */
const normalize = (s) => String(s).trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * HMAC-SHA256 of `<missionId>:<normalized answer>` keyed by the pepper.
 * The pepper is a server secret supplied through the environment and is
 * never committed. A short or missing pepper is a hard error: it would
 * otherwise silently weaken every digest.
 */
function hashAnswer(missionId, answer, pepper = process.env.ANSWER_PEPPER) {
    if (!pepper || pepper.length < 24) throw new Error('ANSWER_PEPPER missing or too short (>= 24 chars).');
    return crypto.createHmac('sha256', pepper).update(`${missionId}:${normalize(answer)}`).digest('hex');
}

/** Constant-time hex digest comparison, safe against timing side channels. */
function sameHash(a, b) {
    const x = Buffer.from(String(a), 'hex');
    const y = Buffer.from(String(b), 'hex');
    return x.length === y.length && crypto.timingSafeEqual(x, y);
}

module.exports = { normalize, hashAnswer, sameHash };
