interface User {
    id: string;
    name: string;
    playerNumber: number | null;
    room: string;
    walletAddress: string | null;
    connected: boolean;
    disconnectedAt: number | null;
}
interface AddUserResult {
    user?: User;
    error?: string;
    reused?: boolean;
}
interface AddUserParams {
    id: string;
    room: string;
    walletAddress?: string;
}
interface ReconnectParams {
    room: string;
    walletAddress?: string;
    newId: string;
}
declare class UserManager {
    private users;
    constructor();
    getUsersInRoom(room: string): User[];
    getUser(id: string): User | undefined;
    nextPlayerNumber(room: string): number | null;
    addOrReuseUser({ id, room, walletAddress }: AddUserParams): AddUserResult;
    markDisconnected(id: string): User | null;
    removeUser(id: string): User | null;
    cleanupDisconnected(): void;
    reconnectUser({ room, walletAddress, newId }: ReconnectParams): User | null;
}
declare const _default: UserManager;
export default _default;
export { User, UserManager, AddUserResult, AddUserParams, ReconnectParams };
//# sourceMappingURL=users.d.ts.map