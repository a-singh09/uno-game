interface GameStatePayload {
    state: any;
    updatedAt: number;
    gameId?: string | number;
    roomId: string;
}
declare class GameStateManager {
    private redisStorage;
    private useRedis;
    private gameStates;
    private cardHashMaps;
    private filePath;
    constructor();
    saveGameState(roomId: string, state: any): Promise<void>;
    saveCardHashMap(roomId: string, cardHashMap: any): Promise<void>;
    getGameState(roomId: string): Promise<GameStatePayload | null>;
    getCardHashMap(roomId: string): Promise<any>;
    deleteGameState(roomId: string): Promise<void>;
    getByGameId(gameId: string | number): Promise<GameStatePayload | null>;
    cleanupOldStates(): void;
    persistToDisk(): void;
    loadFromDisk(): void;
    counts(): {
        gameStates: number;
        activeRooms: number;
    };
    isRedisEnabled(): boolean;
}
declare const _default: GameStateManager;
export default _default;
export { GameStateManager, GameStatePayload };
//# sourceMappingURL=gameStateManager.d.ts.map