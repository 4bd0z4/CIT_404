const fs = require('fs');
const path = require('path');
const db = require('../db_config');

/**
 * Applies the idempotent patches in Backend/migrations/*.sql at startup, in
 * name order. Every file must be safe to run repeatedly (CREATE OR REPLACE,
 * IF NOT EXISTS, ...). A failure is logged and never stops the server: the
 * game keeps running on the previous definition.
 */
async function run() {
    const dir = path.join(__dirname, '..', 'migrations');
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
        try {
            await db.withTransaction((client) =>
                client.query(fs.readFileSync(path.join(dir, file), 'utf8'))
            );
            console.log(`[migrate] applied ${file}`);
        } catch (err) {
            console.warn(`[migrate] ${file} skipped: ${err.message}`);
        }
    }
}

module.exports = { run };
