#!/usr/bin/env node
/**
 * Creates the 12 teams, their join codes, an admin account and a starter
 * set of challenges. Join codes and flags are hashed on the way in, so
 * this script prints them once and they are unrecoverable afterwards.
 *
 *   node scripts/seed.js
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('../db_config');
require('dotenv').config();

const TEAM_COUNT = Number(process.env.SEED_TEAM_COUNT || 17);
const STARTING_BALANCE = Number(process.env.SEED_STARTING_BALANCE || 150);

/** Human-typable code: no 0/O/1/I ambiguity, 8 characters. */
function joinCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from(crypto.randomBytes(8))
        .map((b) => alphabet[b % alphabet.length])
        .join('');
}

/** Public metadata is committed; plaintext proof keys and flags are not. */
function loadChallengeInputs() {
    const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'challenges.json'), 'utf8'));
    const challenges = [...catalog.cp, ...catalog.ctf];
    let secrets = {};
    if (process.env.CHALLENGE_SECRETS_JSON) {
        secrets = JSON.parse(process.env.CHALLENGE_SECRETS_JSON);
    } else {
        const secretPath = process.env.CHALLENGE_SECRETS_FILE
            || path.join(__dirname, '..', 'data', 'challenge-secrets.private.json');
        if (fs.existsSync(secretPath)) secrets = JSON.parse(fs.readFileSync(secretPath, 'utf8'));
    }
    const missing = challenges.filter((c) => !secrets[c.code]).map((c) => c.code);
    if (missing.length) throw new Error(`Missing private challenge secrets for: ${missing.join(', ')}`);
    return { challenges, secrets };
}

const firstBloodCit = (reward) => Math.round(reward * 0.5);
const firstBloodEnergy = (energy) => Math.max(3, Math.round(energy * 0.5));

async function main() {
    console.log('\n=== CIT: 404 - SEEDING THE NETWORK ===\n');

    // --- Admins ------------------------------------------------------
    // Passwords are generated at seed time and printed once. They are never
    // stored in source or plaintext in the database.
    const superadminUsers = (process.env.SEED_SUPERADMIN_USERS || 'Abdelgha44,walidreg')
        .split(',').map((v) => v.trim()).filter(Boolean);
    const missionAdminUsers = (process.env.SEED_MISSION_ADMIN_USERS || 'admin1,admin2,admin3,admin4')
        .split(',').map((v) => v.trim()).filter(Boolean);
    const adminAccounts = [
        ...superadminUsers.map((username) => ({ username, role: 'superadmin' })),
        ...missionAdminUsers.map((username) => ({ username, role: 'mission_admin' })),
    ];

    console.log('ADMIN ACCOUNTS');
    for (const account of adminAccounts) {
        const password = crypto.randomBytes(18).toString('base64url');
        await db.query(
            `INSERT INTO admins (username, password_hash, role)
             VALUES ($1, $2, $3)
             ON CONFLICT (username) DO UPDATE SET
                password_hash = EXCLUDED.password_hash,
                role = EXCLUDED.role`,
            [account.username, await bcrypt.hash(password, 12), account.role]
        );
        console.log(`  ${account.username.padEnd(16)} [${account.role.padEnd(13)}] : ${password}`);
    }
    console.log('  (shown once - store privately now)\n');

    // --- Teams -------------------------------------------------------
    console.log('TEAM JOIN CODES');
    const codes = [];
    for (let i = 1; i <= TEAM_COUNT; i++) {
        const name = `TEAM ${i}`;
        const code = joinCode();
        const { rows } = await db.query(
            `INSERT INTO teams (team_name, join_code_hash, cit_balance)
             VALUES ($1, $2, $3)
             ON CONFLICT (team_name) DO UPDATE SET join_code_hash = EXCLUDED.join_code_hash
             RETURNING id, cit_balance`,
            [name, await bcrypt.hash(code, 10), STARTING_BALANCE]
        );

        // The starting balance is a ledger event like any other, so the
        // journal always sums to the wallet.
        await db.query(
            `INSERT INTO ledger (team_id, kind, amount, balance_after, note)
             SELECT $1, 'SEED', $2, $2, 'Initial Recovery Protocol allocation'
              WHERE NOT EXISTS (SELECT 1 FROM ledger WHERE team_id = $1 AND kind = 'SEED')`,
            [rows[0].id, STARTING_BALANCE]
        );

        codes.push(`  ${name.padEnd(8)} : ${code}`);
    }
    console.log(codes.join('\n'));
    console.log('  (shown once - print and hand out)\n');

    // --- Challenges --------------------------------------------------
    const { challenges, secrets } = loadChallengeInputs();
    for (const c of challenges) {
        await db.query(
            `INSERT INTO challenges
               (code, category, subcategory, difficulty, reward, core_energy,
                first_blood_cit, first_blood_energy, title, description,
                resource_type, resource_url, instructions, flag_hash)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
             ON CONFLICT (code) DO UPDATE SET
                category=EXCLUDED.category, subcategory=EXCLUDED.subcategory,
                difficulty=EXCLUDED.difficulty, reward=EXCLUDED.reward,
                core_energy=EXCLUDED.core_energy,
                first_blood_cit=EXCLUDED.first_blood_cit,
                first_blood_energy=EXCLUDED.first_blood_energy,
                title=EXCLUDED.title, description=EXCLUDED.description,
                resource_type=EXCLUDED.resource_type,
                resource_url=EXCLUDED.resource_url,
                instructions=EXCLUDED.instructions,
                flag_hash=EXCLUDED.flag_hash, is_active=TRUE`,
            [c.code, c.category, c.subcategory || null, c.difficulty, c.reward,
             c.core_energy, firstBloodCit(c.reward), firstBloodEnergy(c.core_energy),
             c.title, c.description, c.resource_type, c.resource_url || null,
             c.instructions || null, await bcrypt.hash(String(secrets[c.code]), 10)]
        );
    }
    console.log(`CHALLENGES : ${challenges.length} loaded (private values hashed)`);
    challenges.forEach((c) => console.log(
        `  ${c.code.padEnd(12)} ${String(c.reward).padStart(4)} CIT$ | ${String(c.core_energy).padStart(3)} CE`
    ));

    // --- Field codes -------------------------------------------------
    const { rows: missionCodes } = await db.query(
        'SELECT mission_name, access_code, location_hint FROM missions ORDER BY position, id'
    );
    console.log('\nMISSION ACCESS CODES (admins only - read out on site):');
    missionCodes.forEach((m) =>
        console.log(`  ${m.mission_name.padEnd(16)} : ${m.access_code}`)
    );

    const { rows: endgameCodes } = await db.query(
        'SELECT position, title, access_code FROM endgame_parts ORDER BY position'
    );
    console.log('\nENDGAME CODES (admins only):');
    endgameCodes.forEach((p) => console.log(`  ${String(p.position).padStart(2)}. ${p.title.padEnd(28)} : ${p.access_code}`));

    console.log('\n=== RECOVERY PROTOCOL READY ===\n');
    await db.pool.end();
}

main().catch((err) => {
    console.error('SEED FAILED:', err);
    process.exit(1);
});
