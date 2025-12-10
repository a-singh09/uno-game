"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = lobbyHandler;
const timers_1 = require("./timers");
const logger_1 = __importDefault(require("../logger"));
function lobbyHandler(io, socket, { userManager }) {
    socket.on('join', ({ room, walletAddress }, callback) => {
        const result = userManager.addOrReuseUser({ id: socket.id, room, walletAddress });
        if (result.error) {
            callback?.(result.error);
            return;
        }
        const { user, reused } = result;
        if (!user)
            return;
        (0, timers_1.clearRemoval)(user.id);
        socket.join(room);
        logger_1.default.info('User %s joined room %s', user.name, room);
        // Emit data to joining user
        socket.emit('currentUserData', { name: user.name });
        // Emit room data to all
        const users = userManager.getUsersInRoom(room);
        io.to(room).emit('roomData', { room, users });
        callback?.(null, { reused });
    });
    socket.on('quitRoom', () => {
        const user = userManager.removeUser(socket.id);
        if (user) {
            socket.leave(user.room);
            const users = userManager.getUsersInRoom(user.room);
            io.to(user.room).emit('roomData', { room: user.room, users });
        }
    });
    socket.on('sendMessage', ({ message }, callback) => {
        const user = userManager.getUser(socket.id);
        if (!user)
            return;
        io.to(user.room).emit('message', { user: user.name, text: message });
        callback?.();
    });
}
//# sourceMappingURL=lobby.js.map