import { Server } from 'socket.io';
import type { GameStateManager } from '../gameStateManager';
import type { UserManager } from '../users';
interface SocketDependencies {
    gameStateManager: GameStateManager;
    userManager: UserManager;
}
declare function registerSocketHandlers(io: Server, { gameStateManager, userManager }: SocketDependencies): void;
export default registerSocketHandlers;
//# sourceMappingURL=index.d.ts.map