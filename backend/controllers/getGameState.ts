import { ConvexHttpClient } from "convex/browser";
// @ts-ignore - Types will be generated after running 'npx convex dev'
import { api } from "../convex/_generated/api";
import logger from "../logger";

interface GameStateResponse {
  success: boolean;
  gameId?: string;
  game?: any;
  hands?: any[];
  cardMappings?: any[];
  error?: string;
}

/**
 * Get game state by numeric game ID
 * @param convex - Convex client instance
 * @param gameId - Numeric game ID as string
 * @returns Game state response object
 */
export async function getGameState(
  convex: ConvexHttpClient,
  gameId: string
): Promise<GameStateResponse> {
  try {
    if (!gameId) {
      return {
        success: false,
        error: "Game ID is required",
      };
    }

    const numericGameId = parseInt(gameId, 10);

    if (isNaN(numericGameId)) {
      return {
        success: false,
        error: "Invalid game ID format",
      };
    }

    const game = await convex.query(api.games.byNumericId, {
      numericId: numericGameId,
    });

    if (!game) {
      logger.warn(`Game state not found for game ID ${gameId}`);
      return {
        success: false,
        error: "Game state not found",
      };
    }

    // Get hands for all players
    const hands = await Promise.all(
      game.players.map((playerAddress: string) =>
        convex.query(api.hands.byPlayer, {
          gameId: game._id,
          playerAddress,
        })
      )
    );

    // Get card mappings
    // @ts-ignore - cardMappings will be available after Convex type generation
    const cardMappings = await convex.query(api.cardMappings.getAllForGame, {
      gameId: game._id,
    });

    logger.info(`Game state retrieved successfully for game ID ${gameId}`);

    return {
      success: true,
      gameId,
      game,
      hands,
      cardMappings,
    };
  } catch (error) {
    logger.error(`Error retrieving game state for game ID ${gameId}:`, error);
    return {
      success: false,
      error: "Failed to retrieve game state",
    };
  }
}
