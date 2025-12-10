import { Server, Socket } from 'socket.io';
import type { UserManager } from '../users';
interface LobbyDependencies {
    userManager: UserManager;
}
export default function lobbyHandler(io: Server, socket: Socket, { userManager }: LobbyDependencies): void;
export {};
//# sourceMappingURL=lobby.d.ts.map