const db = require('../db_config');

/**
 * Every CIT$ and Core Energy movement in the game funnels through here.
 *
 * Two invariants it exists to protect:
 *   1. Three operators share one wallet and they act concurrently. Two
 *      simultaneous purchases must not both read the same balance, so the
 *      team row is locked with SELECT ... FOR UPDATE before any arithmetic.
 *   2. The wallet, the inventory and the ledger must move together. They
 *      are written inside one transaction; a failure rolls back all three.
 *
 * Lock order is always teams first, then the other row (item, challenge,
 * mission). Every function here follows it, so two transactions can never
 * deadlock by grabbing the same pair in opposite orders.
 */

class EconomyError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}

/** Locks the team row for the rest of the transaction. */
async function lockTeam(client, teamId) {
    const { rows } = await client.query(
        'SELECT id, team_name, cit_balance, core_energy, is_locked FROM teams WHERE id = $1 FOR UPDATE',
        [teamId]
    );
    if (!rows[0]) throw new EconomyError('TEAM NOT FOUND.', 404);
    if (rows[0].is_locked) throw new EconomyError('TEAM ACCOUNT FROZEN BY THE CORE.', 423);
    return rows[0];
}

/**
 * Applies a signed CIT$ and energy delta, then writes the matching ledger
 * row. Energy is floored at zero: a penalty can empty a team's reserve but
 * never push it into debt. Must be called inside a transaction.
 */
async function applyDelta(client, {
    teamId, amount = 0, energy = 0, kind, operatorId = null, itemId = null,
    challengeId = null, missionId = null, endgamePartId = null,
    notificationId = null, adminId = null, quantity = 1, note = null,
}) {
    const { rows } = await client.query(
        `UPDATE teams
            SET cit_balance = cit_balance + $1,
                core_energy = GREATEST(0, core_energy + $2)
          WHERE id = $3
        RETURNING cit_balance, core_energy`,
        [amount, energy, teamId]
    );
    const balanceAfter = rows[0].cit_balance;
    const energyAfter = rows[0].core_energy;

    await client.query(
        `INSERT INTO ledger
           (team_id, operator_id, kind, amount, balance_after, energy_delta, energy_after,
            item_id, challenge_id, mission_id, endgame_part_id, notification_id,
            admin_id, quantity, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [teamId, operatorId, kind, amount, balanceAfter, energy, energyAfter,
         itemId, challengeId, missionId, endgamePartId, notificationId,
         adminId, quantity, note]
    );

    return { balance: balanceAfter, coreEnergy: energyAfter };
}

/** Upserts the inventory projection for one (team, item) pair. */
async function addToInventory(client, teamId, itemId, delta) {
    const { rows } = await client.query(
        `INSERT INTO team_inventory (team_id, item_id, quantity, total_bought, first_bought_at, updated_at)
         VALUES ($1, $2, $3, $3, NOW(), NOW())
         ON CONFLICT (team_id, item_id) DO UPDATE
            SET quantity     = team_inventory.quantity + $3,
                total_bought = team_inventory.total_bought + $3,
                updated_at   = NOW()
         RETURNING quantity`,
        [teamId, itemId, delta]
    );
    return rows[0].quantity;
}

/** Consumes units of an item. Throws if the team does not hold enough. */
async function consumeFromInventory(client, teamId, itemId, qty = 1) {
    const { rows } = await client.query(
        `UPDATE team_inventory
            SET quantity   = quantity - $3,
                total_used = total_used + $3,
                updated_at = NOW()
          WHERE team_id = $1 AND item_id = $2 AND quantity >= $3
        RETURNING quantity`,
        [teamId, itemId, qty]
    );
    if (!rows[0]) throw new EconomyError('ITEM NOT IN INVENTORY.', 409);
    return rows[0].quantity;
}

/** The full inventory of a team, catalogue data included, for the UI. */
async function getInventory(clientOrDb, teamId) {
    const { rows } = await clientOrDb.query(
        `SELECT i.id, i.code, i.name, i.item_type, i.icon, i.cost, i.effect,
                i.payload, i.applies_to, ti.quantity, ti.total_bought, ti.total_used
           FROM team_inventory ti
           JOIN items i ON i.id = ti.item_id
          WHERE ti.team_id = $1 AND ti.quantity > 0
          ORDER BY i.item_type, i.cost`,
        [teamId]
    );
    return rows;
}

/** Wallet snapshot without touching anything. */
async function getWallet(clientOrDb, teamId) {
    const { rows } = await clientOrDb.query(
        'SELECT cit_balance, core_energy FROM teams WHERE id = $1',
        [teamId]
    );
    if (!rows[0]) throw new EconomyError('TEAM NOT FOUND.', 404);
    return { balance: rows[0].cit_balance, coreEnergy: rows[0].core_energy };
}

// ---------------------------------------------------------------------
// MARKETPLACE
// ---------------------------------------------------------------------

/** Buys `quantity` units of an item. Atomic: balance, inventory, ledger. */
async function purchaseItem({ teamId, operatorId, itemCode, quantity = 1 }) {
    return db.withTransaction(async (client) => {
        const team = await lockTeam(client, teamId);

        const { rows: itemRows } = await client.query(
            'SELECT * FROM items WHERE code = $1 AND is_active FOR UPDATE',
            [itemCode]
        );
        const item = itemRows[0];
        if (!item) throw new EconomyError('ITEM NOT FOUND IN THE MARKET.', 404);

        const cost = item.cost * quantity;
        if (team.cit_balance < cost) throw new EconomyError('INSUFFICIENT FUNDS.', 402);

        if (item.stock !== null) {
            if (item.stock < quantity) throw new EconomyError('OUT OF STOCK.', 409);
            await client.query('UPDATE items SET stock = stock - $1 WHERE id = $2', [quantity, item.id]);
        }

        if (item.max_per_team !== null) {
            const { rows: held } = await client.query(
                'SELECT total_bought FROM team_inventory WHERE team_id = $1 AND item_id = $2',
                [teamId, item.id]
            );
            const already = held[0] ? held[0].total_bought : 0;
            if (already + quantity > item.max_per_team) {
                throw new EconomyError(`PURCHASE LIMIT REACHED (${item.max_per_team} MAX).`, 409);
            }
        }

        const wallet = await applyDelta(client, {
            teamId, operatorId, amount: -cost, kind: 'ITEM_PURCHASE',
            itemId: item.id, quantity, note: item.name,
        });
        await addToInventory(client, teamId, item.id, quantity);

        return {
            wallet,
            item: { code: item.code, name: item.name, cost: item.cost },
            quantity,
            inventory: await getInventory(client, teamId),
            teamName: team.team_name,
        };
    });
}

/**
 * Spends one unit of an item. No CIT$ moves, but the ledger records it —
 * including which mission it was applied to, which is how insurance and
 * revealed coordinates are looked up later without extra tables.
 */
async function useItem({ teamId, operatorId, itemCode, missionCode = null }) {
    return db.withTransaction(async (client) => {
        await lockTeam(client, teamId);

        const { rows } = await client.query('SELECT * FROM items WHERE code = $1', [itemCode]);
        const item = rows[0];
        if (!item) throw new EconomyError('ITEM NOT FOUND.', 404);

        let mission = null;
        if (missionCode) {
            const { rows: mRows } = await client.query(
                'SELECT id, code, mission_name, coordinates FROM missions WHERE code = $1',
                [missionCode]
            );
            mission = mRows[0] || null;
            if (!mission) throw new EconomyError('MISSION NOT FOUND.', 404);
        } else if (item.applies_to === 'MISSION') {
            throw new EconomyError('THIS ITEM MUST BE APPLIED TO A MISSION.', 400);
        }

        await consumeFromInventory(client, teamId, item.id, 1);
        await applyDelta(client, {
            teamId, operatorId, amount: 0, kind: 'ITEM_USE',
            itemId: item.id, missionId: mission ? mission.id : null,
            note: mission ? `${item.name} -> ${mission.mission_name}` : item.name,
        });

        // The coordinates item is the only one that hands back secret data.
        const revealed = {};
        if (item.code === 'ACCESS_COORD' && mission) {
            revealed.coordinates = mission.coordinates;
        }

        return {
            item: { code: item.code, name: item.name, payload: item.payload },
            revealed,
            inventory: await getInventory(client, teamId),
            wallet: await getWallet(client, teamId),
        };
    });
}

// ---------------------------------------------------------------------
// CHALLENGES
// ---------------------------------------------------------------------

/**
 * Credits a challenge solve. The per-team unique index blocks a second
 * solve; the challenge row is locked so that exactly one team can be
 * awarded first blood even if two submit in the same millisecond.
 */
async function creditChallenge({ teamId, operatorId, challengeId }) {
    return db.withTransaction(async (client) => {
        const team = await lockTeam(client, teamId);

        const { rows: cRows } = await client.query(
            'SELECT * FROM challenges WHERE id = $1 FOR UPDATE',
            [challengeId]
        );
        const challenge = cRows[0];
        if (!challenge) throw new EconomyError('CHALLENGE NOT FOUND.', 404);

        const { rows: fb } = await client.query(
            'SELECT 1 FROM submissions WHERE challenge_id = $1 AND is_first_blood',
            [challengeId]
        );
        const isFirstBlood = fb.length === 0;

        try {
            await client.query(
                `INSERT INTO submissions (team_id, challenge_id, operator_id, is_correct, is_first_blood)
                 VALUES ($1,$2,$3,TRUE,$4)`,
                [teamId, challengeId, operatorId, isFirstBlood]
            );
        } catch (err) {
            if (err.code === '23505') throw new EconomyError('FRAGMENT ALREADY RECOVERED BY YOUR TEAM.', 409);
            throw err;
        }

        let wallet = await applyDelta(client, {
            teamId, operatorId, amount: challenge.reward, energy: challenge.core_energy,
            kind: 'CHALLENGE_REWARD', challengeId: challenge.id, note: challenge.title,
        });

        let bonus = null;
        if (isFirstBlood && (challenge.first_blood_cit > 0 || challenge.first_blood_energy > 0)) {
            wallet = await applyDelta(client, {
                teamId, operatorId,
                amount: challenge.first_blood_cit,
                energy: challenge.first_blood_energy,
                kind: 'FIRST_BLOOD', challengeId: challenge.id,
                note: `First blood - ${challenge.code}`,
            });
            bonus = { cit: challenge.first_blood_cit, energy: challenge.first_blood_energy };
        }

        return {
            wallet,
            reward: challenge.reward,
            energy: challenge.core_energy,
            isFirstBlood,
            bonus,
            challenge: { code: challenge.code, title: challenge.title },
            teamName: team.team_name,
        };
    });
}

// ---------------------------------------------------------------------
// MISSIONS
// ---------------------------------------------------------------------

/**
 * Unlocks a mission with the code an admin reads out on site. The team has
 * to be physically there to have it, which is the whole point of the phase.
 */
async function unlockMission({ teamId, operatorId, missionCode, code }) {
    return db.withTransaction(async (client) => {
        await lockTeam(client, teamId);

        const { rows } = await client.query(
            'SELECT id, code, mission_name, access_code FROM missions WHERE code = $1 AND is_active',
            [missionCode]
        );
        const mission = rows[0];
        if (!mission) throw new EconomyError('MISSION UNAVAILABLE.', 404);

        const given = String(code || '').trim().toUpperCase();
        const expected = String(mission.access_code || '').trim().toUpperCase();
        if (!expected || given !== expected) {
            throw new EconomyError('INVALID ACCESS CODE. FIND THE LOCATION FIRST.', 400);
        }

        await client.query(
            `INSERT INTO team_mission_access (team_id, mission_id, method)
             VALUES ($1, $2, 'CODE')
             ON CONFLICT (team_id, mission_id) DO NOTHING`,
            [teamId, mission.id]
        );

        return { missionCode: mission.code, missionName: mission.mission_name, operatorId };
    });
}

/**
 * Buys a mission at a chosen difficulty. The team must already have
 * unlocked it on site, and the tier decides cost, reward and energy.
 */
async function purchaseMission({ teamId, operatorId, missionCode, difficulty }) {
    return db.withTransaction(async (client) => {
        const team = await lockTeam(client, teamId);

        const { rows: mRows } = await client.query(
            'SELECT * FROM missions WHERE code = $1 AND is_active FOR UPDATE',
            [missionCode]
        );
        const mission = mRows[0];
        if (!mission) throw new EconomyError('MISSION UNAVAILABLE.', 404);

        const { rows: access } = await client.query(
            'SELECT 1 FROM team_mission_access WHERE team_id = $1 AND mission_id = $2',
            [teamId, mission.id]
        );
        if (!access[0]) throw new EconomyError('LOCATION NOT REACHED. ENTER THE ACCESS CODE FIRST.', 423);

        const { rows: tierRows } = await client.query(
            'SELECT * FROM mission_tiers WHERE mission_id = $1 AND difficulty = $2',
            [mission.id, difficulty]
        );
        const tier = tierRows[0];
        if (!tier) throw new EconomyError('DIFFICULTY UNAVAILABLE FOR THIS MISSION.', 404);

        if (team.cit_balance < tier.entry_cost) throw new EconomyError('INSUFFICIENT FUNDS.', 402);

        const deadline = tier.time_limit_min
            ? new Date(Date.now() + tier.time_limit_min * 60_000)
            : null;

        let teamMission;
        try {
            const { rows } = await client.query(
                `INSERT INTO team_missions
                   (team_id, mission_id, difficulty, status, paid_amount, deadline_at)
                 VALUES ($1,$2,$3,'PURCHASED',$4,$5)
                 RETURNING *`,
                [teamId, mission.id, difficulty, tier.entry_cost, deadline]
            );
            teamMission = rows[0];
        } catch (err) {
            if (err.code === '23505') throw new EconomyError('MISSION ALREADY ACQUIRED.', 409);
            throw err;
        }

        const wallet = await applyDelta(client, {
            teamId, operatorId, amount: -tier.entry_cost, kind: 'MISSION_PURCHASE',
            missionId: mission.id, note: `${mission.mission_name} (${difficulty})`,
        });

        return { wallet, mission, tier, teamMission, teamName: team.team_name };
    });
}

/**
 * Admin resolution of a field mission. Success pays the tier's reward and
 * energy. Failure refunds half the entry cost only if the team spent an
 * Insurance item on this mission — which the ledger already records.
 */
async function resolveMission({ teamMissionId, adminId, outcome }) {
    return db.withTransaction(async (client) => {
        const { rows: owner } = await client.query(
            'SELECT team_id FROM team_missions WHERE id = $1',
            [teamMissionId]
        );
        if (!owner[0]) throw new EconomyError('MISSION RECORD NOT FOUND.', 404);
        // Teams first, always: see the lock-order note at the top.
        await client.query('SELECT id FROM teams WHERE id = $1 FOR UPDATE', [owner[0].team_id]);

        const { rows } = await client.query(
            `SELECT tm.*, m.mission_name, m.id AS mission_id,
                    mt.reward, mt.core_energy
               FROM team_missions tm
               JOIN missions m      ON m.id = tm.mission_id
               JOIN mission_tiers mt ON mt.mission_id = tm.mission_id
                                    AND mt.difficulty = tm.difficulty
              WHERE tm.id = $1 FOR UPDATE OF tm`,
            [teamMissionId]
        );
        const tm = rows[0];
        if (!tm) throw new EconomyError('MISSION RECORD NOT FOUND.', 404);
        if (tm.status !== 'PURCHASED') throw new EconomyError('MISSION ALREADY RESOLVED.', 409);

        await client.query(
            'UPDATE team_missions SET status = $1, resolved_at = NOW(), resolved_by = $2 WHERE id = $3',
            [outcome === 'COMPLETED' ? 'COMPLETED' : 'FAILED', adminId, teamMissionId]
        );

        let wallet;
        if (outcome === 'COMPLETED') {
            wallet = await applyDelta(client, {
                teamId: tm.team_id, adminId, amount: tm.reward, energy: tm.core_energy,
                kind: 'MISSION_REWARD', missionId: tm.mission_id, note: tm.mission_name,
            });
        } else {
            const { rows: insured } = await client.query(
                `SELECT 1 FROM ledger l JOIN items i ON i.id = l.item_id
                  WHERE l.team_id = $1 AND l.mission_id = $2
                    AND l.kind = 'ITEM_USE' AND i.code = 'INSURANCE'`,
                [tm.team_id, tm.mission_id]
            );
            if (insured[0]) {
                wallet = await applyDelta(client, {
                    teamId: tm.team_id, adminId, amount: Math.floor(tm.paid_amount / 2),
                    kind: 'MISSION_REWARD', missionId: tm.mission_id,
                    note: `Insurance payout - ${tm.mission_name}`,
                });
            } else {
                wallet = await getWallet(client, tm.team_id);
            }
        }

        return { wallet, teamId: tm.team_id, outcome, missionName: tm.mission_name };
    });
}

// ---------------------------------------------------------------------
// ENDGAME
// ---------------------------------------------------------------------

/** Validates one endgame code and hands back the story fragment. */
async function solveEndgamePart({ teamId, operatorId, position, code }) {
    return db.withTransaction(async (client) => {
        const team = await lockTeam(client, teamId);

        const { rows } = await client.query(
            'SELECT * FROM endgame_parts WHERE position = $1 AND is_active',
            [position]
        );
        const part = rows[0];
        if (!part) throw new EconomyError('FRAGMENT NOT FOUND.', 404);

        const given = String(code || '').trim().toUpperCase();
        if (given !== String(part.access_code).trim().toUpperCase()) {
            throw new EconomyError('INVALID FRAGMENT CODE.', 400);
        }

        try {
            await client.query(
                'INSERT INTO team_endgame (team_id, part_id, operator_id) VALUES ($1,$2,$3)',
                [teamId, part.id, operatorId]
            );
        } catch (err) {
            if (err.code === '23505') throw new EconomyError('FRAGMENT ALREADY RECOVERED.', 409);
            throw err;
        }

        const wallet = await applyDelta(client, {
            teamId, operatorId, amount: part.reward_cit, energy: part.reward_energy,
            kind: 'ENDGAME_REWARD', endgamePartId: part.id, note: part.title,
        });

        const { rows: progress } = await client.query(
            `SELECT (SELECT COUNT(*)::int FROM team_endgame WHERE team_id = $1) AS solved,
                    (SELECT COUNT(*)::int FROM endgame_parts WHERE is_active)    AS total`,
            [teamId]
        );

        return {
            wallet,
            part: {
                position: part.position,
                title: part.title,
                storyFragment: part.story_fragment,
                rewardCit: part.reward_cit,
                rewardEnergy: part.reward_energy,
            },
            progress: progress[0],
            teamName: team.team_name,
        };
    });
}

// ---------------------------------------------------------------------
// NOTIFICATIONS
// ---------------------------------------------------------------------

/**
 * Closes an urgent notification. COMPLETED pays the reward the admin set;
 * FAILED or EXPIRED applies the penalty. Either way the row moves out of
 * SENT exactly once, so a late expiry sweep can never double-charge a team
 * an admin already validated.
 */
async function resolveNotification({ notificationId, adminId = null, outcome }) {
    return db.withTransaction(async (client) => {
        const { rows: owner } = await client.query(
            'SELECT team_id FROM notifications WHERE id = $1',
            [notificationId]
        );
        if (!owner[0]) throw new EconomyError('NOTIFICATION NOT FOUND.', 404);
        await client.query('SELECT id FROM teams WHERE id = $1 FOR UPDATE', [owner[0].team_id]);

        const { rows } = await client.query(
            'SELECT * FROM notifications WHERE id = $1 FOR UPDATE',
            [notificationId]
        );
        const notif = rows[0];
        if (notif.status !== 'SENT') throw new EconomyError('NOTIFICATION ALREADY RESOLVED.', 409);

        await client.query(
            'UPDATE notifications SET status = $1, resolved_at = NOW(), resolved_by = $2 WHERE id = $3',
            [outcome, adminId, notificationId]
        );

        let wallet;
        if (outcome === 'COMPLETED' && notif.reward_cit > 0) {
            wallet = await applyDelta(client, {
                teamId: notif.team_id, adminId, amount: notif.reward_cit,
                kind: 'NOTIF_REWARD', notificationId: notif.id,
                note: `Urgent complete - ${notif.title}`,
            });
        } else if (outcome !== 'COMPLETED' && (notif.penalty_cit > 0 || notif.penalty_energy > 0)) {
            // Never let a penalty push the wallet below zero: the schema
            // forbids it, and a failed order should not brick a team.
            const current = await getWallet(client, notif.team_id);
            const charge = Math.min(current.balance, notif.penalty_cit);
            wallet = await applyDelta(client, {
                teamId: notif.team_id, adminId, amount: -charge, energy: -notif.penalty_energy,
                kind: 'NOTIF_PENALTY', notificationId: notif.id,
                note: `Urgent ${outcome.toLowerCase()} - ${notif.title}`,
            });
        } else {
            wallet = await getWallet(client, notif.team_id);
        }

        return { wallet, teamId: notif.team_id, outcome, notification: notif };
    });
}

/**
 * Sweeps urgent notifications whose deadline has passed. Called on a timer
 * by the server so a team that simply closed the tab still takes the hit.
 */
async function expireOverdueNotifications() {
    const { rows } = await db.query(
        `SELECT id FROM notifications
          WHERE kind = 'URGENT' AND status = 'SENT' AND deadline_at < NOW()`
    );
    const results = [];
    for (const row of rows) {
        try {
            results.push(await resolveNotification({ notificationId: row.id, outcome: 'EXPIRED' }));
        } catch (err) {
            if (!(err instanceof EconomyError)) throw err;
        }
    }
    return results;
}

// ---------------------------------------------------------------------
// ADMIN
// ---------------------------------------------------------------------

/** Manual admin correction. Always leaves a ledger trail with a reason. */
async function adminAdjust({ teamId, adminId, amount = 0, energy = 0, note }) {
    return db.withTransaction(async (client) => {
        await lockTeam(client, teamId);
        const wallet = await applyDelta(client, {
            teamId, adminId, amount, energy, kind: 'ADMIN_ADJUST', note,
        });
        return { wallet };
    });
}

/** Admin grant of an item without charging the team. */
async function adminGrantItem({ teamId, adminId, itemCode, quantity = 1 }) {
    return db.withTransaction(async (client) => {
        await lockTeam(client, teamId);
        const { rows } = await client.query('SELECT * FROM items WHERE code = $1', [itemCode]);
        const item = rows[0];
        if (!item) throw new EconomyError('ITEM NOT FOUND.', 404);

        await addToInventory(client, teamId, item.id, quantity);
        await applyDelta(client, {
            teamId, adminId, amount: 0, kind: 'ADMIN_ADJUST',
            itemId: item.id, quantity, note: `Granted ${quantity}x ${item.name}`,
        });

        return { inventory: await getInventory(client, teamId) };
    });
}

/** Admin override: opens a mission for a team without the on-site code. */
async function adminUnlockMission({ teamId, missionCode }) {
    const { rows } = await db.query('SELECT id FROM missions WHERE code = $1', [missionCode]);
    if (!rows[0]) throw new EconomyError('MISSION NOT FOUND.', 404);
    await db.query(
        `INSERT INTO team_mission_access (team_id, mission_id, method)
         VALUES ($1, $2, 'ADMIN')
         ON CONFLICT (team_id, mission_id) DO NOTHING`,
        [teamId, rows[0].id]
    );
    return { missionCode };
}

module.exports = {
    EconomyError,
    getInventory,
    getWallet,
    purchaseItem,
    useItem,
    creditChallenge,
    unlockMission,
    purchaseMission,
    resolveMission,
    solveEndgamePart,
    resolveNotification,
    expireOverdueNotifications,
    adminAdjust,
    adminGrantItem,
    adminUnlockMission,
};
