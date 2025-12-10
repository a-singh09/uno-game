"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleRemoval = scheduleRemoval;
exports.clearRemoval = clearRemoval;
const constants_1 = require("../constants");
const disconnectTimers = new Map(); // userId -> timeout
function scheduleRemoval(userId, fn) {
    clearRemoval(userId);
    const timer = setTimeout(() => {
        disconnectTimers.delete(userId);
        fn();
    }, constants_1.RECONNECTION_GRACE_MS);
    disconnectTimers.set(userId, timer);
}
function clearRemoval(userId) {
    const timer = disconnectTimers.get(userId);
    if (timer) {
        clearTimeout(timer);
        disconnectTimers.delete(userId);
    }
}
//# sourceMappingURL=timers.js.map