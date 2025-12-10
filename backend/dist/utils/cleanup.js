"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupCleanup = setupCleanup;
const constants_1 = require("../constants");
function setupCleanup({ gameStateManager, userManager }) {
    setInterval(() => userManager.cleanupDisconnected(), constants_1.USER_CLEANUP_INTERVAL_MS);
    setInterval(() => gameStateManager.cleanupOldStates(), constants_1.GAME_CLEANUP_INTERVAL_MS);
}
//# sourceMappingURL=cleanup.js.map