interface LogEntry {
    timestamp: string;
    gameId: string;
    turnNumber: number;
    player: string;
    action: string;
    cardHash?: string;
    cardDetails?: string;
    currentColor?: string;
    currentValue?: string;
    nextPlayer?: string;
}
declare class GameLogger {
    private logFilePath;
    constructor();
    formatLogEntry(entry: LogEntry): string;
    log(entry: LogEntry): void;
    logGameStart(gameId: string, players: string[]): void;
    logCardPlay(gameId: string, turnNumber: number, player: string, cardHash: string, cardDetails: string, currentColor: string, currentValue: string, nextPlayer: string): void;
    logCardDraw(gameId: string, turnNumber: number, player: string, cardHash: string, cardDetails: string, wasPlayed: boolean, nextPlayer: string): void;
    createGameLog(gameId: string): void;
}
declare const _default: GameLogger;
export default _default;
//# sourceMappingURL=gameLogger.d.ts.map