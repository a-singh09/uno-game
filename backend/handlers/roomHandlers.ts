import { Socket } from "socket.io";
import { ConvexHttpClient } from "convex/browser";
// @ts-ignore
import { api } from "../convex/_generated/api";
import logger from "../logger";

export function setupRoomHandlers(
  socket: Socket,
  io: any,
  convex: ConvexHttpClient
) {
  /**
   * Handle joining a room
   */
  socket.on("joinRoom", (roomId: string) => {
    socket.join(roomId);
    logger.info(`User ${socket.id} joined room ${roomId}`);
    io.to(roomId).emit("userJoined", socket.id);
  });

  /**
   * Handle creating a game room
   */
  socket.on("createGameRoom", () => {
    logger.info(`Game room created by user`);
    io.emit("gameRoomCreated");
  });

  /**
   * Handle joining game lobby
   */
  socket.on(
    "join",
    async (
      payload: { room: string; address?: string },
      callback: (error?: string) => void
    ) => {
      try {
        // Get or create game
        let game = await convex.query(api.games.byRoomId, {
          roomId: payload.room,
        });

        if (!game) {
          // Create new game
          await convex.mutation(api.games.create, {
            roomId: payload.room,
            players: [],
          });
          game = await convex.query(api.games.byRoomId, {
            roomId: payload.room,
          });
        }

        if (!game) {
          return callback("Failed to create or find game");
        }

        // Upsert player in Convex
        if (payload.address) {
          await convex.mutation(api.players.upsert, {
            walletAddress: payload.address,
            socketId: socket.id,
            connected: true,
          });

          // Add player to game if not already in it
          if (!game.players.includes(payload.address)) {
            await convex.mutation(api.games.addPlayer, {
              gameId: game._id,
              playerAddress: payload.address,
            });
          }
        }

        socket.join(payload.room);

        // Get updated player list
        const players = await convex.query(api.players.inGame, {
          gameId: game._id,
        });

        const playerName = `Player ${players.length}`;

        // Send room data to all users
        io.to(payload.room).emit("roomData", {
          room: payload.room,
          users: players,
        });
        socket.emit("currentUserData", { name: playerName });

        logger.info(
          `New user ${socket.id} joined as ${playerName} in room ${payload.room}`
        );
        callback();
      } catch (error) {
        logger.error("Error joining room:", error);
        callback((error as Error).message);
      }
    }
  );

  /**
   * Handle leaving a room
   */
  socket.on("leaveRoom", async (roomId: string) => {
    socket.leave(roomId);
    logger.info(`User ${socket.id} left room ${roomId}`);
    io.to(roomId).emit("userLeft", socket.id);
  });

  /**
   * Handle quitting a room
   */
  socket.on("quitRoom", async () => {
    try {
      // Mark player as disconnected in Convex
      const player = await convex.query(api.players.bySocketId, {
        socketId: socket.id,
      });

      if (player) {
        await convex.mutation(api.players.setConnected, {
          walletAddress: player.walletAddress,
          socketId: socket.id,
          connected: false,
        });

        // Get game
        if (player.currentGameId) {
          const game = await convex.query(api.games.byRoomId, {
            roomId: player.currentGameId,
          });

          if (game) {
            const players = await convex.query(api.players.inGame, {
              gameId: game._id,
            });
            io.to(player.currentGameId).emit("roomData", {
              room: player.currentGameId,
              users: players,
            });
          }
        }
      }
    } catch (error) {
      logger.error("Error quitting room:", error);
    }
  });

  /**
   * Handle sending messages
   */
  socket.on(
    "sendMessage",
    async (payload: { message: string }, callback: () => void) => {
      try {
        const player = await convex.query(api.players.bySocketId, {
          socketId: socket.id,
        });

        if (player && player.currentGameId) {
          const game = await convex.query(api.games.byRoomId, {
            roomId: player.currentGameId,
          });

          if (game) {
            io.to(player.currentGameId).emit("message", {
              user: player.walletAddress,
              text: payload.message,
            });
          }
        }
        callback();
      } catch (error) {
        logger.error("Error sending message:", error);
      }
    }
  );
}
