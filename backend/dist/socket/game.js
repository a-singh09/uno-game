"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = gameHandler;
const logger_1 = __importDefault(require("../logger"));
const timers_1 = require("./timers");
function gameHandler(io, socket, { gameStateManager, userManager }) {
    // Join a specific game room (socket.io room)
    socket.on('joinRoom', (roomId) => {
        const user = userManager.getUser(socket.id);
        if (user)
            (0, timers_1.clearRemoval)(user.id);
        socket.join(roomId);
        io.to(roomId).emit('userJoined', socket.id);
    });
    // Create a new game room (broadcast)
    socket.on('createGameRoom', () => {
        io.emit('gameRoomCreated');
    });
    // Game started: save state and broadcast
    socket.on('gameStarted', async ({ roomId, newState, cardHashMap }) => {
        try {
            await gameStateManager.saveGameState(roomId, newState);
            if (cardHashMap) {
                await gameStateManager.saveCardHashMap(roomId, cardHashMap);
            }
            io.to(roomId).emit(`gameStarted-${roomId}`, { newState, cardHashMap });
        }
        catch (err) {
            logger_1.default.error('Error handling gameStarted: %s', err.message);
        }
    });
    // Card play / draw update
    socket.on('playCard', async ({ roomId, action, newState }) => {
        try {
            await gameStateManager.saveGameState(roomId, newState);
            io.to(roomId).emit(`cardPlayed-${roomId}`, { action, newState });
        }
        catch (err) {
            logger_1.default.error('Error handling playCard: %s', err.message);
        }
    });
    // Generic state update with timestamp
    socket.on('updateGameState', async (gameState) => {
        const roomId = gameState?.roomId;
        if (!roomId)
            return;
        const stateWithTs = { ...gameState, _serverTimestamp: Date.now() };
        await gameStateManager.saveGameState(roomId, stateWithTs);
        io.to(roomId).emit('updateGameState', stateWithTs);
    });
    // Request server-side init (optional deck shuffle)
    socket.on('requestGameInit', (payload = {}) => {
        // For now just echo; deck generation could go here
        io.to(payload.roomId || socket.id).emit('initGameState', payload);
    });
    // Leave a game room
    socket.on('leaveRoom', (roomId) => {
        socket.leave(roomId);
        io.to(roomId).emit('userLeft', socket.id);
    });
    // Request game state sync (reconnection)
    socket.on('requestGameStateSync', async ({ roomId, gameId }) => {
        let saved = null;
        let effectiveRoomId = roomId;
        if (effectiveRoomId) {
            saved = await gameStateManager.getGameState(effectiveRoomId);
        }
        if (!saved && gameId) {
            saved = await gameStateManager.getByGameId(gameId);
            if (saved?.roomId) {
                effectiveRoomId = saved.roomId;
            }
        }
        const cardHashMap = effectiveRoomId ? await gameStateManager.getCardHashMap(effectiveRoomId) : null;
        if (!saved || !effectiveRoomId) {
            socket.emit(`gameStateSync-${effectiveRoomId || 'unknown'}`, { error: 'Game state not found' });
            return;
        }
        socket.emit(`gameStateSync-${effectiveRoomId}`, {
            newState: saved.state || saved,
            cardHashMap,
            restored: true,
        });
    });
    // Init game state (bidirectional support)
    socket.on('initGameState', (gameState) => {
        const roomId = gameState?.roomId;
        if (!roomId)
            return;
        io.to(roomId).emit('initGameState', gameState);
    });
}
//# sourceMappingURL=game.js.map