interface User {
    id: string;
    room?: string;
    [key: string]: any;
}
declare class RedisStorage {
    private enabled;
    private client?;
    constructor();
    isEnabled(): boolean;
    set(key: string, value: any, ttlMs?: number): Promise<void>;
    get(key: string): Promise<any>;
    del(key: string): Promise<void>;
    sadd(key: string, member: string): Promise<void>;
    srem(key: string, member: string): Promise<void>;
    smembers(key: string): Promise<string[]>;
    saveGameState(roomId: string, state: any): Promise<void>;
    getGameState(roomId: string): Promise<any>;
    deleteGameState(roomId: string): Promise<void>;
    saveCardHashMap(roomId: string, map: any): Promise<void>;
    getCardHashMap(roomId: string): Promise<any>;
    saveUser(user: User): Promise<void>;
    removeUser(user: User): Promise<void>;
    getUser(socketId: string): Promise<any>;
    getUsersInRoom(room: string): Promise<any[]>;
}
export default RedisStorage;
//# sourceMappingURL=redisStorage.d.ts.map