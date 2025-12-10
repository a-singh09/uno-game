"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.socketConfig = void 0;
const socketConfig = {
    pingTimeout: 120000, // 2 minutes
    pingInterval: 10000, // 10 seconds
    connectTimeout: 30000, // 30 seconds
    transports: ['websocket', 'polling'],
    maxHttpBufferSize: 1e6,
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
};
exports.socketConfig = socketConfig;
//# sourceMappingURL=socket.js.map