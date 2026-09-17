/**
 * Thin wrapper around the Socket.IO server so route handlers never touch
 * `io` directly. Rooms:
 *   team_<id>  - the three operators sharing one wallet
 *   admins     - the supervision platform
 *   feed       - public activity feed (leaderboard / news)
 */
let io = null;

function bind(server) {
    io = server;
}

function toTeam(teamId, event, payload) {
    if (io) io.to(`team_${teamId}`).emit(event, payload);
}

function toAdmins(event, payload) {
    if (io) io.to('admins').emit(event, payload);
}

function toFeed(event, payload) {
    if (io) io.to('feed').emit(event, payload);
}

function broadcastAll(event, payload) {
    if (io) io.emit(event, payload);
}

/**
 * A wallet change concerns all three parties at once: the operators who
 * need the new balance, and the admin dashboard.
 */
function broadcastWallet(teamId, { balance, coreEnergy }) {
    toTeam(teamId, 'wallet_update', { balance, coreEnergy });
    toAdmins('team_update', { teamId, balance, coreEnergy });
}

function broadcastInventory(teamId, inventory) {
    toTeam(teamId, 'inventory_update', { inventory });
    toAdmins('inventory_update', { teamId, inventory });
}

function broadcastActivity(entry) {
    toFeed('activity', entry);
    toAdmins('activity', entry);
}

/** A phase switch changes what every connected operator may do. */
function broadcastPhase(state) {
    broadcastAll('phase_change', state);
}

/**
 * Admin message to one team. Urgent ones drive a blocking modal, so they
 * go out on their own event rather than riding the generic feed.
 */
function broadcastNotification(teamId, notification) {
    toTeam(teamId, 'notification', notification);
    toAdmins('notification_sent', { teamId, notification });
}

function broadcastNotificationResolved(teamId, payload) {
    toTeam(teamId, 'notification_resolved', payload);
    toAdmins('notification_resolved', { teamId, ...payload });
}

module.exports = {
    bind, toTeam, toAdmins, toFeed, broadcastAll,
    broadcastWallet, broadcastInventory, broadcastActivity,
    broadcastPhase, broadcastNotification, broadcastNotificationResolved,
};
