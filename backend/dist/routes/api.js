"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const os_1 = __importDefault(require("os"));
const gameStateManager_1 = __importDefault(require("../gameStateManager"));
const redisStorage_1 = __importDefault(require("../services/redisStorage"));
const router = express_1.default.Router();
router.get('/health', async (_req, res) => {
    const redis = new redisStorage_1.default();
    const redisEnabled = redis.isEnabled();
    const counts = gameStateManager_1.default.counts();
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        gameStates: counts.gameStates,
        activeRooms: counts.activeRooms,
        redisEnabled,
        storageType: redisEnabled ? 'redis' : 'memory',
        memory: process.memoryUsage(),
        loadavg: os_1.default.loadavg(),
    });
});
exports.default = router;
//# sourceMappingURL=api.js.map