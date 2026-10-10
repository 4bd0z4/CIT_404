#!/usr/bin/env node
/**
 * set:endgame - store the real final flag.
 *
 * The flag is read from the ENDGAME_FLAG environment variable (set it in the
 * Railway dashboard, or inline in the shell) so it never lands in git or in
 * shell arguments. It is not printed back.
 *
 *   ENDGAME_FLAG='CIT{...}' npm run set:endgame
 *
 * It also widens endgame_parts.access_code to TEXT (idempotent) because the
 * original VARCHAR(32) cannot hold a full flag. Teams are matched
 * case-insensitively and ignoring surrounding whitespace, as the game does.
 */
const db = require('../db_config');
require('dotenv').config();

const PLACEHOLDER = 'SET_ENDGAME_FLAG_BEFORE_EVENT';

async function main() {
    const flag = String(process.env.ENDGAME_FLAG || '').trim();
    if (!flag) throw new Error('ENDGAME_FLAG is not set.');
    if (flag === PLACEHOLDER) throw new Error('ENDGAME_FLAG is still the placeholder.');
    if (flag.length > 500) throw new Error('ENDGAME_FLAG is unreasonably long (>500).');
    if (!/^CIT\{.+\}$/.test(flag)) {
        console.warn('WARNING: flag does not look like CIT{...} - storing it anyway.');
    }

    await db.withTransaction(async (client) => {
        await client.query('ALTER TABLE endgame_parts ALTER COLUMN access_code TYPE TEXT');
        const { rowCount } = await client.query(
            'UPDATE endgame_parts SET access_code = $1 WHERE position = 1',
            [flag]
        );
        if (rowCount !== 1) throw new Error('No endgame part at position 1 - was the DB seeded?');
    });

    console.log(`Endgame flag stored (${flag.length} characters, starts "${flag.slice(0, 4)}", ends "${flag.slice(-1)}").`);
}

main()
    .catch((err) => { console.error('FAILED:', err.message); process.exitCode = 1; })
    .finally(() => db.pool.end());
