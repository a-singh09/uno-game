"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_STORED_GAMES = exports.FILE_PERSIST_INTERVAL_MS = exports.GAME_CLEANUP_INTERVAL_MS = exports.USER_CLEANUP_INTERVAL_MS = exports.GAME_STATE_TTL_MS = exports.RECONNECTION_GRACE_MS = exports.MAX_PLAYERS = void 0;
exports.MAX_PLAYERS = 6;
exports.RECONNECTION_GRACE_MS = 60000;
exports.GAME_STATE_TTL_MS = 60 * 60 * 1000; // 1 hour
exports.USER_CLEANUP_INTERVAL_MS = 30 * 1000;
exports.GAME_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
exports.FILE_PERSIST_INTERVAL_MS = 30 * 1000;
exports.MAX_STORED_GAMES = 10;
//# sourceMappingURL=constants.js.map