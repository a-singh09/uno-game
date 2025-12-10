"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserManager = void 0;
const logger_1 = __importDefault(require("./logger"));
const constants_1 = require("./constants");
class UserManager {
    constructor() {
        this.users = new Map(); // socketId -> user
    }
    getUsersInRoom(room) {
        return Array.from(this.users.values()).filter((u) => u.room === room);
    }
    getUser(id) {
        return this.users.get(id);
    }
    nextPlayerNumber(room) {
        const present = new Set(this.getUsersInRoom(room)
            .filter((u) => u.playerNumber != null)
            .map((u) => u.playerNumber));
        for (let i = 1; i <= constants_1.MAX_PLAYERS; i++) {
            if (!present.has(i))
                return i;
        }
        return null;
    }
    addOrReuseUser({ id, room, walletAddress }) {
        logger_1.default.info('addOrReuseUser: incoming', { id, room, walletAddress });
        const existingDisconnected = this.getUsersInRoom(room).find((u) => u.walletAddress &&
            walletAddress &&
            u.walletAddress.toLowerCase() === walletAddress.toLowerCase() &&
            !u.connected);
        logger_1.default.info('addOrReuseUser: existingDisconnected?', { found: !!existingDisconnected, existingDisconnected });
        if (existingDisconnected) {
            existingDisconnected.id = id;
            existingDisconnected.connected = true;
            existingDisconnected.disconnectedAt = null;
            this.users.set(id, existingDisconnected);
            logger_1.default.info('addOrReuseUser: reused disconnected user', { id, room, walletAddress });
            return { user: existingDisconnected, reused: true };
        }
        const existingConnected = this.getUsersInRoom(room).find((u) => u.walletAddress &&
            walletAddress &&
            u.walletAddress.toLowerCase() === walletAddress.toLowerCase());
        if (existingConnected) {
            existingConnected.id = id;
            existingConnected.connected = true;
            existingConnected.disconnectedAt = null;
            logger_1.default.info('addOrReuseUser: reused connected user', { id, room, walletAddress });
            return { user: existingConnected, reused: true };
        }
        // Enforce capacity
        const usersInRoom = this.getUsersInRoom(room).filter((u) => u.connected);
        if (usersInRoom.length >= constants_1.MAX_PLAYERS) {
            logger_1.default.warn('addOrReuseUser: room full', { room, usersInRoom: usersInRoom.length });
            return { error: 'Room full' };
        }
        const playerNumber = this.nextPlayerNumber(room);
        logger_1.default.info('addOrReuseUser: assigning playerNumber', { room, playerNumber });
        const user = {
            id,
            name: `Player ${playerNumber}`,
            playerNumber,
            room,
            walletAddress: walletAddress || null,
            connected: true,
            disconnectedAt: null,
        };
        this.users.set(id, user);
        logger_1.default.info('addOrReuseUser: created new user', { id, room, walletAddress, playerNumber });
        return { user, reused: false };
    }
    markDisconnected(id) {
        const user = this.users.get(id);
        if (!user)
            return null;
        user.connected = false;
        user.disconnectedAt = Date.now();
        return user;
    }
    removeUser(id) {
        const user = this.users.get(id);
        if (!user)
            return null;
        this.users.delete(id);
        return user;
    }
    cleanupDisconnected() {
        const now = Date.now();
        for (const [id, user] of this.users.entries()) {
            if (!user.connected && user.disconnectedAt && now - user.disconnectedAt > constants_1.RECONNECTION_GRACE_MS) {
                this.users.delete(id);
            }
        }
    }
    reconnectUser({ room, walletAddress, newId }) {
        const candidates = this.getUsersInRoom(room).filter((u) => !u.connected);
        let match = undefined;
        if (walletAddress) {
            match = candidates.find((u) => u.walletAddress &&
                u.walletAddress.toLowerCase() === walletAddress.toLowerCase());
        }
        if (!match) {
            match = candidates[0];
        }
        if (!match)
            return null;
        // Reassign id and mark connected
        this.users.delete(match.id);
        match.id = newId;
        match.connected = true;
        match.disconnectedAt = null;
        this.users.set(newId, match);
        return match;
    }
}
exports.UserManager = UserManager;
exports.default = new UserManager();
//# sourceMappingURL=users.js.map