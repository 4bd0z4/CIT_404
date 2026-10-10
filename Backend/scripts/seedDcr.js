#!/usr/bin/env node
// Loads the DCR missions + their answer hashes into the GAME database
// (table dcr_missions). Safe to re-run (idempotent upsert).
//
// The mission text lives in version control (Backend/data/dcr-missions.json);
// the answer HASHES do NOT. They are produced out of band from the plaintext
// answers with ANSWER_PEPPER and dcrAnswers.hashAnswer, then handed to this
// script through a file that is never committed (keep it in .gitignore).
//
// USAGE:
//   DATABASE_URL=<game db> node scripts/seedDcr.js [missionsPath] [hashesPath]
// Defaults:
//   missionsPath = ../data/dcr-missions.json
//   hashesPath   = ./dcr-answer-hashes.json   (NOT committed)
//
// The hashes file maps mission id -> hex HMAC digest, e.g.
//   { "M01": "ab12...", "M02": "cd34...", ... }
//
// To (re)generate the hashes file locally from a private answers file:
//   const { hashAnswer } = require('../routes/dcrAnswers');
//   // answers = { "M01": "NODE00042", ... }  (never committed)
//   const out = {};
//   for (const [id, ans] of Object.entries(answers)) out[id] = hashAnswer(id, ans);
//   fs.writeFileSync('scripts/dcr-answer-hashes.json', JSON.stringify(out, null, 2));
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const missionsPath = process.argv[2] || path.join(__dirname, '..', 'data', 'dcr-missions.json');
const hashesPath = process.argv[3] || path.join(__dirname, 'dcr-answer-hashes.json');

function loadJson(p, label) {
    if (!fs.existsSync(p)) {
        console.error(`${label} not found: ${p}`);
        process.exit(1);
    }
    return JSON.parse(fs.readFileSync(p, 'utf8'));
}

(async () => {
    const data = loadJson(missionsPath, 'Missions file');
    const hashes = loadJson(hashesPath, 'Answer-hashes file');

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // Insert in id order so a prerequisite row exists before the mission
        // that references it (M04 -> M03, M10 -> M09).
        const ordered = [...data.missions].sort((a, b) => a.id.localeCompare(b.id));
        for (const m of ordered) {
            if (!hashes[m.id]) throw new Error(`No answer hash for ${m.id}`);
            await client.query(
                `INSERT INTO dcr_missions (id, level, title, story, question, answer_format, reward_cit, reward_ce,
                                           prerequisite, first_blood_eligible, answer_hash, epilogue)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                 ON CONFLICT (id) DO UPDATE SET level=EXCLUDED.level, title=EXCLUDED.title, story=EXCLUDED.story,
                   question=EXCLUDED.question, answer_format=EXCLUDED.answer_format, reward_cit=EXCLUDED.reward_cit,
                   reward_ce=EXCLUDED.reward_ce, prerequisite=EXCLUDED.prerequisite,
                   first_blood_eligible=EXCLUDED.first_blood_eligible, answer_hash=EXCLUDED.answer_hash,
                   epilogue=EXCLUDED.epilogue`,
                [m.id, m.level, m.title, m.story, m.question, m.answer_format, m.reward_cit, m.reward_ce,
                 m.prerequisite, m.first_blood_eligible, hashes[m.id], m.unlocks_epilogue ? data.epilogue : null]
            );
        }
        await client.query('COMMIT');
        console.log(`Seeded ${ordered.length} DCR missions.`);
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('DCR SEED FAILED:', e.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
})();
