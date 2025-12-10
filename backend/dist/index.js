"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/* Main server entry for Zunno backend */
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const cors_1 = __importDefault(require("cors"));
const socket_io_1 = require("socket.io");
const socket_1 = require("./config/socket");
const socket_2 = __importDefault(require("./socket"));
const api_1 = __importDefault(require("./routes/api"));
const logger_1 = __importDefault(require("./logger"));
const gameStateManager_1 = __importDefault(require("./gameStateManager"));
const users_1 = __importDefault(require("./users"));
const cleanup_1 = require("./utils/cleanup");
const PORT = process.env.PORT || 4000;
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use('/api', api_1.default);
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server, socket_1.socketConfig);
(0, socket_2.default)(io, { gameStateManager: gameStateManager_1.default, userManager: users_1.default });
// Apply server-level timeouts
server.timeout = 120000; // 120 seconds
(0, cleanup_1.setupCleanup)({ gameStateManager: gameStateManager_1.default, userManager: users_1.default });
server.listen(PORT, () => {
    logger_1.default.info(`Zunno backend listening on port ${PORT}`);
});
exports.default = server;
//# sourceMappingURL=index.js.map