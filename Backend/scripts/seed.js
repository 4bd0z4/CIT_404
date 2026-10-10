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

    // --- Post-challenge patches (hints, deactivations) -------------------
    // These run AFTER the upsert so they are not overwritten by is_active=TRUE.
    await db.query(`
        -- Deactivate web challenges (no AWS host deployed)
        UPDATE challenges SET is_active = false WHERE code = 'CTF-WE-03';

        -- CTF hints
        UPDATE challenges SET hint1='Base64.' WHERE code='CTF-CR-01';
        UPDATE challenges SET hint1='Aktar kalma sma3tiha had 3 weeks "bizu" hiya l key.' WHERE code='CTF-CR-02';
        UPDATE challenges SET hint1='Each chunk is a character.' WHERE code='CTF-CR-03';
        UPDATE challenges SET hint1='The URL has the tool that you should use.' WHERE code='CTF-OS-01';
        UPDATE challenges SET hint1='9lab 3la chi blassa fl INPT fl maps.' WHERE code='CTF-OS-02';
        UPDATE challenges SET hint1='Maybe you should check the past code, not the code that you see now.' WHERE code='CTF-OS-03';
        UPDATE challenges SET hint1='Check CIT Instagram account.' WHERE code='CTF-MI-01';
        UPDATE challenges SET hint1='There is an eval in the code that will be so useful.', hint2='Use int() function, and use strings.' WHERE code='CTF-MI-02';
        UPDATE challenges SET hint1='Some lines have useful information.', hint2='The flag is scattered in lines in the logs.' WHERE code='CTF-MI-04';
        UPDATE challenges SET hint1='Look for the metadata of the image.' WHERE code='CTF-ST-01';
        UPDATE challenges SET hint1='Spectrogram.' WHERE code='CTF-ST-02';
        UPDATE challenges SET hint1='Search about injections vulnerability.', hint2='Use SQL injection.' WHERE code='CTF-WE-01';
        UPDATE challenges SET hint1='Look carefully in the URL — something changes every time. You can exploit it.' WHERE code='CTF-WE-02';
        UPDATE challenges SET hint1='There is not only the HTML code. Search for JavaScript code.', hint2='There is a strange variable in the JavaScript file.' WHERE code='CTF-WE-03';

        -- CP hints
        UPDATE challenges SET
          hint1='In Python, use a for loop to examine each element. Use an if condition to filter. Pay attention to the difference between negative values and zero.',
          hint2='Create an empty list for valid values. Python''s append() lets you add each valid value as you iterate. Since you process left to right, order is preserved. Print the size before printing elements.'
        WHERE code='CP-A';
        UPDATE challenges SET
          hint1='Think about the value needed to pair with each token. If the current token is A_i, what must another have so their sum equals K? You cannot use the same index twice.',
          hint2='Checking every pair is too slow for N=10^5. Use a dictionary to remember visited values and indices. Scan left to right, look for the complement before storing. This achieves O(N).'
        WHERE code='CP-B';
        UPDATE challenges SET
          hint1='Verify two independent conditions. Count occurrences of a specific string and compare neighbors. Remember "WA", "TLE", and "RTE" all represent errors.',
          hint2='Use a counter for "AC" tokens, compare with T. Iterate with indices, check each "AC" token''s previous and next neighbors. If either condition fails: "FRAUDULENT".'
        WHERE code='CP-C';
        UPDATE challenges SET
          hint1='A valid contiguous sequence can contain at most K negative numbers. Think about examining consecutive elements while tracking negative count. Zero is not corrupted!',
          hint2='Use two pointers for window boundaries. Expand right, track negatives. When count exceeds K, move left until valid. Update max length at each step. O(N) complexity.'
        WHERE code='CP-D';
        UPDATE challenges SET
          hint1='Each log message has been reversed. The keyword may not appear in its usual form. Strings can be reversed using slicing. Which version should you inspect for citlogin?',
          hint2='Reverse each corrupted string first, then use Python''s in operator to check for citlogin as a substring. Keep a counter for matches.'
        WHERE code='CP-E';
        UPDATE challenges SET
          hint1='Each partition must contain consecutive cells. Minimize the largest partition sum. The answer cannot be smaller than the largest cell, nor exceed the total sum.',
          hint2='Use binary search on the maximum allowed partition load. For a candidate limit, greedily scan left to right, starting a new partition when adding the next cell exceeds the limit.'
        WHERE code='CP-F';
        UPDATE challenges SET
          hint1='A string can be reversed using slicing. Compare each fragment with its reverse. Track frequencies. Palindromes need careful counting since reversing them gives the same string.',
          hint2='Use collections.Counter for frequencies. For each string and its reverse, count unordered pairs without double-counting. Check for odd-frequency palindromes. Apply status rules in priority order.'
        WHERE code='CP-G';
    `);
    console.log('PATCHES : web deactivated, all hints applied');

    // --- Resource URLs for challenge files ---
    await db.query(`
        UPDATE challenges SET resource_type='DOWNLOAD', resource_url='/challs/cr01-cipher.txt' WHERE code='CTF-CR-01';
        UPDATE challenges SET resource_type='DOWNLOAD', resource_url='/challs/cr02-cipher.txt' WHERE code='CTF-CR-02';
        UPDATE challenges SET resource_type='DOWNLOAD', resource_url='/challs/cr03-binary.txt' WHERE code='CTF-CR-03';
        UPDATE challenges SET resource_type='DOWNLOAD', resource_url='/challs/mi04-server.log' WHERE code='CTF-MI-04';
        UPDATE challenges SET resource_type='DOWNLOAD', resource_url='/challs/st01-bizu.jpg' WHERE code='CTF-ST-01';
        UPDATE challenges SET resource_type='DOWNLOAD', resource_url='/challs/st02-signal.wav' WHERE code='CTF-ST-02';
        UPDATE challenges SET resource_type='SERVICE', resource_url='nc altaria.proxy.rlwy.net 36043' WHERE code='CTF-MI-02';
        UPDATE challenges SET resource_type='EXTERNAL', resource_url='https://cit-challenges.github.io/wayback-machine-challenge/' WHERE code='CTF-OS-01';
        UPDATE challenges SET resource_type='EXTERNAL', resource_url='https://github.com/CIT-challeges/project' WHERE code='CTF-MI-01';
        UPDATE challenges SET resource_type='SERVICE', resource_url='https://citchallenge1.pythonanywhere.com/' WHERE code='CTF-WE-01';
        UPDATE challenges SET resource_type='SERVICE', resource_url='https://citchallenge.pythonanywhere.com/' WHERE code='CTF-WE-02';
    `);

    challenges.forEach((c) => console.log(
        `  ${c.code.padEnd(12)} ${String(c.reward).padStart(4)} CIT$ | ${String(c.core_energy).padStart(3)} CE`
    ));

    // --- Field codes -------------------------------------------------
    // seed.sql ships well-known default codes, and this repository is public:
    // anyone could unlock every mission without going on site. Replace any
    // code that is still a default with a random one. Codes that were already
    // changed are left alone, so re-running the seed does not rotate them.
    const PUBLIC_DEFAULT_CODES = ['SUPPLY01', 'GREEN01', 'TOWER02', 'FORT03', 'PORT04'];
    const { rows: stale } = await db.query(
        'SELECT id FROM missions WHERE access_code = ANY($1::text[])', [PUBLIC_DEFAULT_CODES]
    );
    for (const m of stale) {
        await db.query('UPDATE missions SET access_code = $2 WHERE id = $1', [m.id, joinCode().slice(0, 6)]);
    }
    if (stale.length) console.log(`\n(${stale.length} public default field code(s) replaced with random ones)`);

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
