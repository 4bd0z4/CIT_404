#!/usr/bin/env node
/**
 * reset:teams - put every team back to a clean starting line, right before
 * the event goes live.
 *
 * WIPES, for ALL teams:
 *   solves + first bloods (submissions), the CIT$/energy ledger, missions and
 *   unlocks, endgame progress, inventory, notifications, DCR solves/attempts/
 *   query log.
 * THEN sets each team to: core_energy 0, cit_balance STARTING_BALANCE (150 by
 *   default, SEED_STARTING_BALANCE to override), unlocked, plus one SEED
 *   ledger row so the journal still sums to the wallet.
 *
 * KEEPS: teams and their join codes, challenges + flags, items, missions and
 * tasks, DCR missions, admins, the current phase and its timer.
 *
 * Dry run by default - it only prints what it WOULD delete:
 *   npm run reset:teams
 * Actually do it:
 *   npm run reset:teams -- --yes
 *
 * Options:
 *   --ensure-teams=17   also create any missing TEAM 1..17 (new random codes,
 *                       printed once). Existing teams and codes are untouched.
 *   --new-codes         give EVERY team a fresh join code and print the full
 *                       list of all teams. Old codes stop working. Codes are
 *                       stored hashed, so this is the only way to get a full
 *                       printable list; without it only newly created teams
 *                       show a code.
 *   --lobby             also set the game phase back to LOBBY (no timer), so
 *                       nothing is playable until an admin starts Challenges.
 *   --purge-sessions    also delete operators and sessions of teams, so every
 *                       team must log in again. Without it, anyone already
 *                       logged in stays logged in.
 *
 * Open browser tabs keep showing old numbers until they refresh or the next
 * live event arrives, so tell operators to refresh after a reset.
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../db_config');
require('dotenv').config();

const STARTING_BALANCE = Number(process.env.SEED_STARTING_BALANCE || 150);

const args = process.argv.slice(2);
const YES = args.includes('--yes');
const PURGE_SESSIONS = args.includes('--purge-sessions');
const NEW_CODES = args.includes('--new-codes');
const LOBBY = args.includes('--lobby');
const ensureArg = args.find((a) => a.startsWith('--ensure-teams='));
const ENSURE_TEAMS = ensureArg ? Number(ensureArg.split('=')[1]) : 0;

if (ensureArg && (!Number.isInteger(ENSURE_TEAMS) || ENSURE_TEAMS < 1 || ENSURE_TEAMS > 100)) {
    console.error('--ensure-teams must be an integer between 1 and 100.');
    process.exit(1);
}
if (!Number.isInteger(STARTING_BALANCE) || STARTING_BALANCE < 0) {
    console.error('SEED_STARTING_BALANCE must be a non-negative integer.');
    process.exit(1);
}

/** Same human-typable format as seed.js: no 0/O/1/I, 8 characters. */
function joinCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from(crypto.randomBytes(8)).map((b) => alphabet[b % alphabet.length]).join('');
}

// Children first. `dcr_*` tables are optional (they are created by init.sql
// but guard anyway so the script also works on a trimmed schema).
const TEAM_TABLES = [
    'ledger', 'submissions', 'team_missions', 'team_mission_access', 'team_endgame',
    'team_inventory', 'notifications', 'dcr_solves', 'dcr_attempts', 'dcr_query_log',
];
const SESSION_TABLES = ['sessions', 'operators'];

async function exists(conn, table) {
    const { rows } = await conn.query('SELECT to_regclass($1) AS t', [`public.${table}`]);
    return rows[0].t !== null;
}

async function main() {
    const target = (process.env.DATABASE_URL || '').replace(/\/\/[^@]*@/, '//***@');
    console.log(`Database : ${target || '(DATABASE_URL not set)'}`);
    console.log(`Mode     : ${YES ? 'EXECUTE' : 'DRY RUN (add --yes to execute)'}\n`);

    // Report what is there (read-only, outside any write transaction).
    const tables = [];
    console.log('Rows that will be deleted:');
    for (const t of [...TEAM_TABLES, ...(PURGE_SESSIONS ? SESSION_TABLES : [])]) {
        if (!(await exists(db, t))) continue;
        tables.push(t);
        const { rows } = await db.query(`SELECT count(*)::int AS n FROM ${t}`);
        console.log(`  ${t.padEnd(22)} ${rows[0].n}`);
    }
    const teamCount = (await db.query('SELECT count(*)::int AS n FROM teams')).rows[0].n;
    console.log(`\nTeams reset to ${STARTING_BALANCE} CIT$ / 0 energy: ${teamCount}`);
    if (ENSURE_TEAMS) console.log(`Missing teams up to TEAM ${ENSURE_TEAMS} will be created.`);
    if (NEW_CODES) console.log('ALL teams will get NEW join codes (old codes stop working).');
    if (LOBBY) console.log('Game phase will be set back to LOBBY.');

    if (!YES) {
        console.log('\nDry run only - nothing was changed.');
        return;
    }

    const newCodes = [];
    let printList = [];
    await db.withTransaction(async (client) => {
        for (const t of tables) await client.query(`DELETE FROM ${t}`);

        await client.query(
            'UPDATE teams SET cit_balance = $1, core_energy = 0, is_locked = FALSE',
            [STARTING_BALANCE]
        );

        if (ENSURE_TEAMS) {
            for (let i = 1; i <= ENSURE_TEAMS; i++) {
                const name = `TEAM ${i}`;
                const code = joinCode();
                const { rowCount } = await client.query(
                    `INSERT INTO teams (team_name, join_code_hash, cit_balance)
                     VALUES ($1, $2, $3) ON CONFLICT (team_name) DO NOTHING`,
                    [name, await bcrypt.hash(code, 10), STARTING_BALANCE]
                );
                if (rowCount) newCodes.push(`  ${name.padEnd(8)} : ${code}`);
            }
        }

        const allCodes = [];
        if (NEW_CODES) {
            const { rows: all } = await client.query('SELECT id, team_name FROM teams ORDER BY id');
            for (const t of all) {
                const code = joinCode();
                await client.query('UPDATE teams SET join_code_hash = $2 WHERE id = $1', [t.id, await bcrypt.hash(code, 10)]);
                allCodes.push(`  ${t.team_name.padEnd(8)} : ${code}`);
            }
        }

        if (LOBBY) {
            await client.query(
                `UPDATE game_state SET phase = 'LOBBY', phase_started_at = NULL,
                        phase_ends_at = NULL, updated_at = NOW() WHERE id = 1`
            );
        }

        printList = NEW_CODES ? allCodes : newCodes;

        // One SEED row per team so SUM(ledger.amount) == cit_balance again.
        await client.query(
            `INSERT INTO ledger (team_id, kind, amount, balance_after, note)
             SELECT id, 'SEED', $1, $1, 'Initial Recovery Protocol allocation' FROM teams`,
            [STARTING_BALANCE]
        );

        // Self-check inside the transaction: any drift aborts (rolls back).
        const { rows: drift } = await client.query(
            `SELECT t.team_name FROM teams t
              WHERE t.cit_balance <> COALESCE((SELECT SUM(amount) FROM ledger l WHERE l.team_id = t.id), 0)
                 OR t.core_energy <> 0`
        );
        if (drift.length) throw new Error(`Ledger/wallet mismatch after reset: ${drift.map((d) => d.team_name).join(', ')}`);
    });

    console.log('\nRESET COMPLETE. All teams are at the starting line.');
    if (printList.length) {
        console.log(`\n${NEW_CODES ? 'ALL TEAM JOIN CODES' : 'NEW TEAM JOIN CODES'} (shown once - store privately now):`);
        console.log(printList.join('\n'));
    }
    if (LOBBY) console.log('\nPhase is LOBBY. Start Challenges from the admin panel when ready.');
    console.log('\nTell operators to refresh their browser.');
}

main()
    .catch((err) => {
        console.error('RESET FAILED, nothing was changed:', err.message);
        process.exitCode = 1;
    })
    .finally(() => db.pool.end());
