"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = connectionHandler;
const logger_1 = __importDefault(require("../logger"));
const timers_1 = require("./timers");
function connectionHandler(io, socket, { userManager }) {
    // Send server socket id
    socket.emit('server_id', socket.id);
    socket.on('disconnect', (reason) => {
        const user = userManager.markDisconnected(socket.id);
        if (user) {
            logger_1.default.info('User disconnected %s (%s)', user.name, reason);
            // notify room
            io.to(user.room).emit('playerDisconnected', {
                userId: user.id,
                userName: user.name,
                temporary: true,
                reason,
            });
            (0, timers_1.scheduleRemoval)(user.id, () => {
                const removed = userManager.removeUser(user.id);
                if (removed) {
                    io.to(user.room).emit('playerLeft', {
                        userId: removed.id,
                        userName: removed.name,
                        permanent: true,
                    });
                    const updated = userManager.getUsersInRoom(user.room);
                    io.to(user.room).emit('roomData', { room: user.room, users: updated });
                }
            });
        }
    });
}
//# sourceMappingURL=connection.js.map