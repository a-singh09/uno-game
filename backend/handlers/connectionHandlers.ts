import { Socket } from "socket.io";
import { ConvexHttpClient } from "convex/browser";
// @ts-ignore
import { api } from "../convex/_generated/api";
import logger from "../logger";

export function setupConnectionHandlers(
  socket: Socket,
  io: any,
  convex: ConvexHttpClient,
  activeConnections: { count: number }
) {
  /**
   * Handle socket disconnect
   */
  socket.on("disconnect", async (reason: string) => {
    activeConnections.count--;
    logger.info(
      `User ${socket.id} disconnected: ${reason}. Active connections: ${activeConnections.count}`
    );

    try {
      // Mark player as temporarily disconnected in Convex
      const player = await convex.query(api.players.bySocketId, {
        socketId: socket.id,
      });

      if (player) {
        await convex.mutation(api.players.setConnected, {
          walletAddress: player.walletAddress,
          socketId: socket.id,
          connected: false,
        });

        // Notify other players
        if (player.currentGameId) {
          io.to(player.currentGameId).emit("playerDisconnected", {
            userId: socket.id,
            userName: player.walletAddress,
            temporary: true,
            reason: reason,
          });

          // Set timeout to permanently remove if no reconnect (60 seconds)
          setTimeout(async () => {
            try {
              const currentPlayer = await convex.query(api.players.bySocketId, {
                socketId: socket.id,
              });

              if (currentPlayer && !currentPlayer.connected) {
                await convex.mutation(api.players.leaveGame, {
                  walletAddress: currentPlayer.walletAddress,
                });

                logger.info(
                  `User ${socket.id} did not reconnect, removed from game`
                );

                if (currentPlayer.currentGameId) {
                  const game = await convex.query(api.games.byRoomId, {
                    roomId: currentPlayer.currentGameId,
                  });

                  if (game) {
                    const players = await convex.query(api.players.inGame, {
                      gameId: game._id,
                    });

                    io.to(currentPlayer.currentGameId).emit("roomData", {
                      room: currentPlayer.currentGameId,
                      users: players,
                    });

                    io.to(currentPlayer.currentGameId).emit("playerLeft", {
                      userId: socket.id,
                      userName: currentPlayer.walletAddress,
                      permanent: true,
                    });
                  }
                }
              } else if (currentPlayer && currentPlayer.connected) {
                logger.info(`User ${socket.id} reconnected before timeout`);
              }
            } catch (error) {
              logger.error("Error in disconnect timeout:", error);
            }
          }, 60000); // 60 second grace period
        }
      }
    } catch (error) {
      logger.error("Error handling disconnect:", error);
    }
  });

  /**
   * Handle socket errors
   */
  socket.on("error", (error: Error) => {
    logger.error(`Socket ${socket.id} error:`, error);
  });
}
