import { Socket } from "socket.io";
import { ConvexHttpClient } from "convex/browser";
// @ts-ignore
import { api } from "../convex/_generated/api";
import logger from "../logger";

export function setupGameActionHandlers(
  socket: Socket,
  io: any,
  convex: ConvexHttpClient
) {
  /**
   * Handle game initialization (from frontend)
   * Frontend emits: initGameState with full initial game state
   */
  socket.on("initGameState", async (data: any) => {
    try {
      const { roomId } = socket.data;
      logger.info(`Initializing game state in room ${roomId}`);

      if (!roomId) {
        logger.error("No roomId found in socket data");
        return;
      }

      const { gameState, cardMappings, players } = data;

      // Store initial game state in Convex
      try {
        await convex.mutation(api.gameActions.storeCompleteGameState, {
          roomId,
          gameState,
        });

        // Store player hands
        if (players && gameState) {
          await convex.mutation(api.gameActions.storePlayerHands, {
            roomId,
            players,
            hands: gameState,
          });
        }

        // Store card mappings
        if (cardMappings) {
          await convex.mutation(api.gameActions.storeCardMappings, {
            roomId,
            cardMappings,
          });
        }

        logger.info(`Stored initial game state in Convex for room ${roomId}`);
      } catch (convexError) {
        logger.error("Error storing initial state in Convex:", convexError);
      }

      // Broadcast initial game state to all clients in the room
      io.to(roomId).emit("initGameState", data);
      logger.info(`Game state initialized and broadcast to room ${roomId}`);
    } catch (error) {
      logger.error("Error initializing game state:", error);
    }
  });

  /**
   * Handle game state updates (from frontend)
   * Frontend emits: updateGameState with partial game state changes
   * Backend stores state in Convex and broadcasts to all clients
   */
  socket.on("updateGameState", async (gameState: any) => {
    try {
      const { roomId } = socket.data;
      logger.info(`Updating game state in room ${roomId}`);

      if (!roomId) {
        logger.error("No roomId found in socket data");
        return;
      }

      // Store updated game state in Convex
      try {
        await convex.mutation(api.gameActions.storeCompleteGameState, {
          roomId,
          gameState,
        });

        // Record move to history if it's a card play or draw
        if (gameState.lastCardPlayedBy && gameState.turnCount) {
          const playerIndex = parseInt(
            gameState.turn?.replace("Player ", "") || "1"
          ) - 1;

          // This would require knowing the game ID - we'll add this later
          // For now, just store the state
        }

        logger.info(`Updated game state in Convex for room ${roomId}`);
      } catch (convexError) {
        logger.error("Error updating state in Convex:", convexError);
      }

      // Broadcast updated game state to all clients in the room
      io.to(roomId).emit("updateGameState", gameState);
      logger.info(`Game state updated and broadcast to room ${roomId}`);
    } catch (error) {
      logger.error("Error updating game state:", error);
      socket.emit("error", { message: "Failed to update game state" });
    }
  });
}
