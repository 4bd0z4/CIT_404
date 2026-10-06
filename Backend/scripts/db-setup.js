#!/usr/bin/env node
/**
 * One-shot database bootstrap, meant to run from inside the Railway network
 * (or anywhere DATABASE_URL is reachable) so we never need a public DB proxy.
 *
 * It runs, in order:
 *   1. Infrastructure & Deployment/init.sql   — schema, indexes, views
 *   2. Infrastructure & Deployment/seed.sql   — items / missions / endgame
 *   3. scripts/seed.js                         — admin, teams, challenges
 *                                                (bcrypt, so it must be Node)
 *
 * Steps 1 and 2 are idempotent-ish: init.sql drops and recreates everything,
 * so re-running wipes game state and starts clean. Use it to reset between
 * events, not mid-event.
 *
 * Usage (locally or as a Railway pre-deploy / console command):
 *   npm run db:setup          # schema + content + seed (prints codes once)
 *   npm run db:schema         # only init.sql + seed.sql
 *
 * Env:
 *   DATABASE_URL   required (Railway injects it)
 *   DB_SETUP_SEED  '0' to skip the Node seed step (schema only)
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const db = require('../db_config');

/**
 * The SQL files are copied into Backend/sql/ so they ship with the Railway
 * service (whose root is Backend/). When run from a full local checkout we
 * fall back to the canonical copies under Infrastructure & Deployment/.
 */
function resolveSql(name) {
    const candidates = [
        path.join(__dirname, '..', 'sql', name),
        path.join(__dirname, '..', '..', 'Infrastructure & Deployment', name),
    ];
    return candidates.find((p) => fs.existsSync(p)) || candidates[0];
}

const INIT_SQL = resolveSql('init.sql');
const SEED_SQL = resolveSql('seed.sql');

async function runSqlFile(label, file) {
    if (!fs.existsSync(file)) {
        throw new Error(`${label}: file not found at ${file}`);
    }
    const sql = fs.readFileSync(file, 'utf8');
    process.stdout.write(`\n=== ${label} (${path.basename(file)}) ===\n`);
    // The pg driver runs a multi-statement string in one simple-query call,
    // which is exactly what these files expect (no $-params inside them).
    await db.query(sql);
    process.stdout.write(`    OK\n`);
}

async function main() {
    if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL is not set.');
    }

    await runSqlFile('SCHEMA', INIT_SQL);
    await runSqlFile('CONTENT', SEED_SQL);

    // Release the pool before handing off to seed.js, which opens its own.
    await db.pool.end();

    if (process.env.DB_SETUP_SEED === '0') {
        process.stdout.write('\nSkipping Node seed (DB_SETUP_SEED=0). Schema + content only.\n');
        return;
    }

    process.stdout.write('\n=== SEED (admin, teams, challenges) ===\n');
    // Run the existing seed script as a child process so its own pool
    // lifecycle and process.exit handling stay intact. Inherit stdio so the
    // one-time admin password and team codes land in the deploy logs.
    execFileSync(process.execPath, [path.join(__dirname, 'seed.js')], {
        stdio: 'inherit',
        env: process.env,
    });
}

main()
    .then(() => {
        process.stdout.write('\n=== DATABASE READY ===\n');
        process.exit(0);
    })
    .catch((err) => {
        console.error('\nDB SETUP FAILED:', err.message);
        process.exit(1);
    });
