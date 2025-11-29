import { Socket } from "socket.io";
import { ConvexHttpClient } from "convex/browser";
// @ts-ignore
import { api } from "../convex/_generated/api";
import logger from "../logger";

export function setupReconnectionHandlers(
  socket: Socket,
  io: any,
  convex: ConvexHttpClient
) {
  /**
   * Handle room rejoin after disconnect
   */
  socket.on(
    "rejoinRoom",
    async (
      {
        room,
        gameId,
        playerAddress,
      }: { room: string; gameId?: number; playerAddress?: string },
      callback: (response: any) => void
    ) => {
      try {
        logger.info(
          `User ${socket.id} attempting to rejoin room ${room} with address ${playerAddress}`
        );

        // Query Convex for game and player data
        let game = null;
        if (gameId) {
          game = await convex.query(api.games.byNumericId, {
            numericId: gameId,
          });
        } else {
          game = await convex.query(api.games.byRoomId, { roomId: room });
        }

        if (game) {
          // Update player connection status in Convex
          if (playerAddress) {
            await convex.mutation(api.players.setConnected, {
              walletAddress: playerAddress,
              socketId: socket.id,
              connected: true,
            });
          }

          // Join socket rooms
          socket.join(room);
          if (gameId) {
            socket.join(`game-${gameId}`);
          }

          logger.info(`User ${socket.id} successfully rejoined room ${room}`);

          // Get updated player list
          const players = await convex.query(api.players.inGame, {
            gameId: game._id,
          });

          // Get complete game state for reconnection
          let restoredState = null;
          if (playerAddress) {
            try {
              restoredState = await convex.query(
                api.gameActions.getGameStateForReconnection,
                {
                  roomId: room,
                  playerAddress,
                }
              );
              logger.info(
                `Retrieved game state for reconnection: ${playerAddress} in room ${room}`
              );
            } catch (error) {
              logger.error("Error retrieving game state for reconnection:", error);
            }
          }

          if (callback && typeof callback === "function") {
            callback({
              success: true,
              room,
              gameId,
              userName: playerAddress,
              reconnected: true,
              gameState: restoredState?.gameState,
              cardMappings: restoredState?.cardMappings,
              players: restoredState?.players,
            });
          }

          // Notify other players
          socket.to(room).emit("playerReconnected", {
            userId: socket.id,
            userName: playerAddress,
            room,
            timestamp: Date.now(),
          });

          socket.emit("reconnected", {
            room,
            gameId,
            userName: playerAddress,
            gameState: restoredState?.gameState,
            cardMappings: restoredState?.cardMappings,
          });

          // Send updated room data
          io.to(room).emit("roomData", { room, users: players });
          logger.info(
            `Sent updated room data to room ${room} with ${players.length} players`
          );
        } else {
          logger.warn(`Room ${room} not found for rejoin`);
          if (callback && typeof callback === "function") {
            callback({ success: false, error: "Room not found or expired" });
          }
        }
      } catch (error) {
        logger.error(`Error rejoining room ${room}:`, error);
        if (callback && typeof callback === "function") {
          callback({ success: false, error: (error as Error).message });
        }
      }
    }
  );

  /**
   * Handle game state sync request
   */
  socket.on(
    "requestGameStateSync",
    async ({ roomId, gameId }: { roomId: string; gameId?: number }) => {
      try {
        logger.info(
          `User ${socket.id} requesting game state sync for room ${roomId}, game ${gameId}`
        );

        // Query game from Convex
        let game: any = null;
        if (gameId) {
          game = await convex.query(api.games.byNumericId, {
            numericId: gameId,
          });
        } else {
          game = await convex.query(api.games.byRoomId, { roomId });
        }

        if (game) {
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
          // @ts-ignore
          const cardMappings = await convex.query(
            api.cardMappings.getAllForGame,
            {
              gameId: game._id,
            }
          );

          socket.emit(`gameStateSync-${roomId}`, {
            newState: game,
            hands,
            cardMappings,
            restored: true,
          });
          logger.info(
            `Game state synced for user ${socket.id} in room ${roomId}`
          );
        } else {
          logger.warn(
            `No game state found for room ${roomId} or game ${gameId}`
          );
          socket.emit(`gameStateSync-${roomId}`, {
            error: "Game state not found",
          });
        }
      } catch (error) {
        logger.error(`Error syncing game state for room ${roomId}:`, error);
        socket.emit(`gameStateSync-${roomId}`, {
          error: (error as Error).message,
        });
      }
    }
  );
}
