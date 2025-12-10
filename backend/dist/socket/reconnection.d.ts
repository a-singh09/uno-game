import { Server, Socket } from 'socket.io';
import type { UserManager } from '../users';
import type { GameStateManager } from '../gameStateManager';
interface ReconnectionDependencies {
    userManager: UserManager;
    gameStateManager: GameStateManager;
}
export default function reconnectionHandler(io: Server, socket: Socket, { userManager, gameStateManager }: ReconnectionDependencies): void;
export {};
//# sourceMappingURL=reconnection.d.ts.map