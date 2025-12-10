"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = reconnectionHandler;
const logger_1 = __importDefault(require("../logger"));
const timers_1 = require("./timers");
function reconnectionHandler(io, socket, { userManager, gameStateManager }) {
    socket.on('rejoinRoom', ({ room, gameId, walletAddress }, callback) => {
        const match = userManager.reconnectUser({
            room,
            walletAddress,
            newId: socket.id,
        });
        if (!match) {
            callback?.({ success: false, error: 'Room not found' });
            return;
        }
        (0, timers_1.clearRemoval)(match.id);
        socket.join(room);
        logger_1.default.info('User reconnected to room %s as %s', room, match.name);
        socket.emit('reconnected', { room, gameId });
        io.to(room).emit('playerReconnected', {
            userId: match.id,
            room,
            timestamp: Date.now(),
        });
        const users = userManager.getUsersInRoom(room);
        io.to(room).emit('roomData', { room, users });
        callback?.({ success: true, room, gameId });
    });
}
//# sourceMappingURL=reconnection.js.map