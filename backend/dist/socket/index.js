"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const connection_1 = __importDefault(require("./connection"));
const lobby_1 = __importDefault(require("./lobby"));
const game_1 = __importDefault(require("./game"));
const reconnection_1 = __importDefault(require("./reconnection"));
function registerSocketHandlers(io, { gameStateManager, userManager }) {
    io.on('connection', (socket) => {
        (0, connection_1.default)(io, socket, { userManager });
        (0, lobby_1.default)(io, socket, { userManager });
        (0, game_1.default)(io, socket, { gameStateManager, userManager });
        (0, reconnection_1.default)(io, socket, { gameStateManager, userManager });
    });
}
exports.default = registerSocketHandlers;
//# sourceMappingURL=index.js.map