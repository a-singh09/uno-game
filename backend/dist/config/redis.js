"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRedisClient = createRedisClient;
exports.getRedisEnabled = getRedisEnabled;
const ioredis_1 = __importDefault(require("ioredis"));
const logger_1 = __importDefault(require("../logger"));
function createRedisClient(role = 'data') {
    const { REDIS_URL, REDIS_HOST = '127.0.0.1', REDIS_PORT = '6379', REDIS_PASSWORD, REDIS_DB = '0', } = process.env;
    const options = REDIS_URL
        ? { lazyConnect: true, maxRetriesPerRequest: 3, enableReadyCheck: true }
        : {
            host: REDIS_HOST,
            port: Number(REDIS_PORT),
            password: REDIS_PASSWORD || undefined,
            db: Number(REDIS_DB),
            lazyConnect: true,
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
        };
    const client = REDIS_URL ? new ioredis_1.default(REDIS_URL, options) : new ioredis_1.default(options);
    client.on('connect', () => logger_1.default.info(`[redis-${role}] connected`));
    client.on('error', (err) => logger_1.default.error(`[redis-${role}] error: ${err.message}`));
    client.on('close', () => logger_1.default.warn(`[redis-${role}] connection closed`));
    client.on('reconnecting', () => logger_1.default.warn(`[redis-${role}] reconnecting...`));
    return client;
}
function getRedisEnabled() {
    return String(process.env.REDIS_ENABLED || 'false').toLowerCase() === 'true';
}
//# sourceMappingURL=redis.js.map