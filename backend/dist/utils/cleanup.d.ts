import type { GameStateManager } from '../gameStateManager';
import type { UserManager } from '../users';
interface CleanupDependencies {
    gameStateManager: GameStateManager;
    userManager: UserManager;
}
declare function setupCleanup({ gameStateManager, userManager }: CleanupDependencies): void;
export { setupCleanup };
//# sourceMappingURL=cleanup.d.ts.map