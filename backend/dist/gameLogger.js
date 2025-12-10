"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const logger_1 = __importDefault(require("./logger"));
// Create game-logs directory if it doesn't exist
const gameLogsDir = path_1.default.join(__dirname, 'game-logs');
if (!fs_1.default.existsSync(gameLogsDir)) {
    fs_1.default.mkdirSync(gameLogsDir, { recursive: true });
}
class GameLogger {
    constructor() {
        this.logFilePath = path_1.default.join(gameLogsDir, 'game-history.log');
    }
    formatLogEntry(entry) {
        const parts = [
            `[${entry.timestamp}]`,
            `Game: ${entry.gameId}`,
            `Turn: ${entry.turnNumber}`,
            `Player: ${entry.player.substring(0, 8)}...`,
            `Action: ${entry.action}`,
        ];
        if (entry.cardHash) {
            parts.push(`Card: ${entry.cardHash.substring(0, 10)}...`);
        }
        if (entry.cardDetails) {
            parts.push(`Details: ${entry.cardDetails}`);
        }
        if (entry.currentColor) {
            parts.push(`Color: ${entry.currentColor}`);
        }
        if (entry.currentValue) {
            parts.push(`Value: ${entry.currentValue}`);
        }
        if (entry.nextPlayer) {
            parts.push(`Next: ${entry.nextPlayer.substring(0, 8)}...`);
        }
        return parts.join(' | ');
    }
    log(entry) {
        const logLine = this.formatLogEntry(entry);
        try {
            // Write to game-specific log file
            fs_1.default.appendFileSync(this.logFilePath, logLine + '\n', 'utf8');
            // Also log to winston logger for monitoring
            logger_1.default.info(`[GAME] ${logLine}`);
        }
        catch (error) {
            logger_1.default.error('Failed to write to game log file:', error);
        }
    }
    logGameStart(gameId, players) {
        const entry = {
            timestamp: new Date().toISOString(),
            gameId: gameId.toString(),
            turnNumber: 0,
            player: 'SYSTEM',
            action: 'startGame',
            cardDetails: `Players: ${players.length}`,
        };
        this.log(entry);
        // Log all players
        players.forEach((player, index) => {
            logger_1.default.info(`[GAME] Player ${index + 1}: ${player}`);
        });
    }
    logCardPlay(gameId, turnNumber, player, cardHash, cardDetails, currentColor, currentValue, nextPlayer) {
        const entry = {
            timestamp: new Date().toISOString(),
            gameId: gameId.toString(),
            turnNumber,
            player,
            action: 'playCard',
            cardHash,
            cardDetails,
            currentColor,
            currentValue,
            nextPlayer,
        };
        this.log(entry);
    }
    logCardDraw(gameId, turnNumber, player, cardHash, cardDetails, wasPlayed, nextPlayer) {
        const entry = {
            timestamp: new Date().toISOString(),
            gameId: gameId.toString(),
            turnNumber,
            player,
            action: 'drawCard',
            cardHash,
            cardDetails: `${cardDetails} (${wasPlayed ? 'played immediately' : 'added to hand'})`,
            nextPlayer,
        };
        this.log(entry);
    }
    createGameLog(gameId) {
        const gameLogPath = path_1.default.join(gameLogsDir, `game-${gameId}.log`);
        const header = `=== GAME ${gameId} LOG ===\nStarted: ${new Date().toISOString()}\n\n`;
        try {
            fs_1.default.writeFileSync(gameLogPath, header, 'utf8');
        }
        catch (error) {
            logger_1.default.error('Failed to create game-specific log file:', error);
        }
    }
}
// Export singleton instance
exports.default = new GameLogger();
//# sourceMappingURL=gameLogger.js.map