"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const redis_1 = require("../config/redis");
const logger_1 = __importDefault(require("../logger"));
const constants_1 = require("../constants");
class RedisStorage {
    constructor() {
        this.enabled = (0, redis_1.getRedisEnabled)();
        if (this.enabled) {
            this.client = (0, redis_1.createRedisClient)('data');
            this.client.connect().catch((err) => {
                logger_1.default.error('Redis connect error, disabling Redis: %s', err.message);
                this.enabled = false;
            });
        }
    }
    isEnabled() {
        return this.enabled;
    }
    async set(key, value, ttlMs) {
        if (!this.enabled || !this.client)
            return;
        const payload = JSON.stringify(value);
        if (ttlMs) {
            await this.client.set(key, payload, 'PX', ttlMs);
        }
        else {
            await this.client.set(key, payload);
        }
    }
    async get(key) {
        if (!this.enabled || !this.client)
            return null;
        const res = await this.client.get(key);
        return res ? JSON.parse(res) : null;
    }
    async del(key) {
        if (!this.enabled || !this.client)
            return;
        await this.client.del(key);
    }
    async sadd(key, member) {
        if (!this.enabled || !this.client)
            return;
        await this.client.sadd(key, member);
    }
    async srem(key, member) {
        if (!this.enabled || !this.client)
            return;
        await this.client.srem(key, member);
    }
    async smembers(key) {
        if (!this.enabled || !this.client)
            return [];
        return this.client.smembers(key);
    }
    async saveGameState(roomId, state) {
        await this.set(`game:state:${roomId}`, state, constants_1.GAME_STATE_TTL_MS);
    }
    async getGameState(roomId) {
        return this.get(`game:state:${roomId}`);
    }
    async deleteGameState(roomId) {
        await this.del(`game:state:${roomId}`);
        await this.del(`game:cardhash:${roomId}`);
    }
    async saveCardHashMap(roomId, map) {
        await this.set(`game:cardhash:${roomId}`, map, constants_1.GAME_STATE_TTL_MS);
    }
    async getCardHashMap(roomId) {
        return this.get(`game:cardhash:${roomId}`);
    }
    async saveUser(user) {
        const key = `user:${user.id}`;
        await this.set(key, user, 24 * 60 * 60 * 1000); // 24h
        await this.sadd('users:all', user.id);
        if (user.room) {
            await this.sadd(`room:users:${user.room}`, user.id);
        }
    }
    async removeUser(user) {
        const key = `user:${user.id}`;
        await this.del(key);
        await this.srem('users:all', user.id);
        if (user.room) {
            await this.srem(`room:users:${user.room}`, user.id);
        }
    }
    async getUser(socketId) {
        return this.get(`user:${socketId}`);
    }
    async getUsersInRoom(room) {
        const ids = await this.smembers(`room:users:${room}`);
        const users = await Promise.all(ids.map(async (id) => ({ id, ...(await this.get(`user:${id}`)) })));
        return users.filter(Boolean);
    }
}
exports.default = RedisStorage;
//# sourceMappingURL=redisStorage.js.map