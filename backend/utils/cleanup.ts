import {
  USER_CLEANUP_INTERVAL_MS,
  GAME_CLEANUP_INTERVAL_MS,
} from '../constants';
import type { GameStateManager } from '../gameStateManager';
import type { UserManager } from '../users';

interface CleanupDependencies {
  gameStateManager: GameStateManager;
  userManager: UserManager;
}

function setupCleanup({ gameStateManager, userManager }: CleanupDependencies): void {
  setInterval(() => userManager.cleanupDisconnected(), USER_CLEANUP_INTERVAL_MS);
  setInterval(() => gameStateManager.cleanupOldStates(), GAME_CLEANUP_INTERVAL_MS);
}

export { setupCleanup };
