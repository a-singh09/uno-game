import { Server, Socket } from 'socket.io';
import type { GameStateManager } from '../gameStateManager';
import type { UserManager } from '../users';
interface GameDependencies {
    gameStateManager: GameStateManager;
    userManager: UserManager;
}
export default function gameHandler(io: Server, socket: Socket, { gameStateManager, userManager }: GameDependencies): void;
export {};
//# sourceMappingURL=game.d.ts.map