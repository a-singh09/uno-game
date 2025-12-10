"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameStateManager = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const logger_1 = __importDefault(require("./logger"));
const redisStorage_1 = __importDefault(require("./services/redisStorage"));
const constants_1 = require("./constants");
class GameStateManager {
    constructor() {
        this.redisStorage = new redisStorage_1.default();
        this.useRedis = this.redisStorage.isEnabled();
        this.gameStates = new Map(); // roomId -> { state, updatedAt, gameId }
        this.cardHashMaps = new Map(); // roomId -> map
        this.filePath = path_1.default.join(__dirname, 'game-states.json');
        this.loadFromDisk();
        setInterval(() => this.persistToDisk(), constants_1.FILE_PERSIST_INTERVAL_MS);
    }
    async saveGameState(roomId, state) {
        const payload = {
            state,
            updatedAt: Date.now(),
            gameId: state?.id,
            roomId,
        };
        this.gameStates.set(roomId, payload);
        if (this.useRedis) {
            await this.redisStorage.saveGameState(roomId, payload);
        }
    }
    async saveCardHashMap(roomId, cardHashMap) {
        this.cardHashMaps.set(roomId, cardHashMap);
        if (this.useRedis) {
            await this.redisStorage.saveCardHashMap(roomId, cardHashMap);
        }
    }
    async getGameState(roomId) {
        if (this.useRedis) {
            const redisState = await this.redisStorage.getGameState(roomId);
            if (redisState)
                return redisState;
        }
        return this.gameStates.get(roomId) || null;
    }
    async getCardHashMap(roomId) {
        if (this.useRedis) {
            const redisMap = await this.redisStorage.getCardHashMap(roomId);
            if (redisMap)
                return redisMap;
        }
        return this.cardHashMaps.get(roomId) || null;
    }
    async deleteGameState(roomId) {
        this.gameStates.delete(roomId);
        this.cardHashMaps.delete(roomId);
        if (this.useRedis) {
            await this.redisStorage.deleteGameState(roomId);
        }
    }
    async getByGameId(gameId) {
        // Try in-memory first
        for (const [, value] of this.gameStates.entries()) {
            if (String(value.gameId) === String(gameId)) {
                return value;
            }
        }
        // Redis fallback
        if (this.useRedis) {
            // Inefficient without an index; rely on room lookups from client
            return null;
        }
        return null;
    }
    cleanupOldStates() {
        const now = Date.now();
        for (const [roomId, value] of this.gameStates.entries()) {
            if (now - value.updatedAt > constants_1.GAME_STATE_TTL_MS) {
                this.gameStates.delete(roomId);
                this.cardHashMaps.delete(roomId);
            }
        }
    }
    persistToDisk() {
        try {
            const entries = Array.from(this.gameStates.values())
                .sort((a, b) => b.updatedAt - a.updatedAt)
                .slice(0, constants_1.MAX_STORED_GAMES);
            fs_1.default.writeFileSync(this.filePath, JSON.stringify(entries, null, 2), 'utf8');
        }
        catch (err) {
            logger_1.default.error('Failed to persist game states: %s', err.message);
        }
    }
    loadFromDisk() {
        try {
            if (!fs_1.default.existsSync(this.filePath))
                return;
            const raw = fs_1.default.readFileSync(this.filePath, 'utf8');
            if (!raw)
                return;
            const entries = JSON.parse(raw);
            entries.forEach((entry) => {
                if (entry.roomId && entry.state) {
                    this.gameStates.set(entry.roomId, entry);
                }
            });
        }
        catch (err) {
            logger_1.default.warn('No persisted game states loaded: %s', err.message);
        }
    }
    counts() {
        return {
            gameStates: this.gameStates.size,
            activeRooms: this.gameStates.size,
        };
    }
    isRedisEnabled() {
        return this.useRedis;
    }
}
exports.GameStateManager = GameStateManager;
exports.default = new GameStateManager();
//# sourceMappingURL=gameStateManager.js.map