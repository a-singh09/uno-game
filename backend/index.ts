import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import express, { Request, Response } from "express";
import cors from "cors";
import http from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import { WebSocketServer } from "ws";
import path from "path";
import { ConvexHttpClient } from "convex/browser";
// @ts-ignore - Types will be generated after running 'npx convex dev'
import { api } from "./convex/_generated/api.js";
// @ts-ignore - Types will be generated after running 'npx convex dev'
import logger from "./logger.js";

const app = express();
const server = http.createServer(app);

// Initialize Convex client
const convexUrl = process.env.CONVEX_URL;
if (!convexUrl) {
  throw new Error("CONVEX_URL environment variable is required");
}
const convex = new ConvexHttpClient(convexUrl);

// Socket.IO server setup
const io = new SocketIOServer(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  wsEngine: WebSocketServer,
  pingTimeout: 30000,
  pingInterval: 10000,
  connectTimeout: 20000,
  maxHttpBufferSize: 1e6,
  transports: ["websocket", "polling"],
  allowEIO3: true,
});

const PORT = process.env.PORT || 4000;
server.timeout = 120000;

app.use(cors());
app.use(express.json());

// Track active connections
let activeConnections = 0;

// ============================================
// API ENDPOINTS
// ============================================

// Health check endpoint
app.get("/health", async (req: Request, res: Response) => {
  try {
    // Query Convex for game stats
    const games = await convex.query(api.games.listAll);
    const activeGames = games.filter((g) => g.status === "Started");

    res.status(200).json({
      status: "ok",
      connections: activeConnections,
      uptime: process.uptime(),
      totalGames: games.length,
      activeGames: activeGames.length,
    });
  } catch (error) {
    logger.error("Health check failed:", error);
    res.status(500).json({
      status: "error",
      error: "Failed to fetch game stats",
    });
  }
});

// Get game state by numeric game ID
app.get("/api/game-state/:gameId", async (req: Request, res: Response) => {
  try {
    const { gameId } = req.params;

    if (!gameId) {
      return res.status(400).json({ error: "Game ID is required" });
    }

    const numericGameId = parseInt(gameId, 10);
    // Normalize roomId - remove 'game-' prefix if present
    const normalizedGameId = gameId.startsWith('game-') ? gameId.replace('game-', '') : gameId;
    const game = await convex.query(api.games.byRoomId, {
      roomId: normalizedGameId,
    });

    if (game) {
      // Get hands for all players
      const hands = await Promise.all(
        game.players.map((playerAddress) =>
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

      logger.info(`Game state retrieved for game ID ${gameId}`);
      return res.status(200).json({
        success: true,
        gameId,
        game,
        hands,
        cardMappings,
      });
    } else {
      return res.status(404).json({
        success: false,
        error: "Game state not found",
      });
    }
  } catch (error) {
    logger.error(`Error retrieving game state for game ID ${req.params.gameId}:`, error);
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve game state",
    });
  }
});

// Get recent games
app.get("/api/recent-games", async (req: Request, res: Response) => {
  try {
    const games = await convex.query(api.games.listAll);
    const recentGames = games
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 20);

    res.status(200).json({
      success: true,
      games: recentGames,
      count: recentGames.length,
    });
  } catch (error) {
    logger.error("Error retrieving recent games:", error);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve recent games",
    });
  }
});

// Create claimable balance endpoint (preserved from original)
app.post("/api/create-claimable-balance", async (req: Request, res: Response) => {
  try {
    const { winnerAddress, gameId } = req.body;

    if (!winnerAddress) {
      return res.status(400).json({ error: "Winner address is required" });
    }

    // Import dynamically to avoid build issues
    const { createClaimableBalance } = await import("./diamnetService.js");
    const result = await createClaimableBalance(winnerAddress);

    return res.status(200).json(result);
  } catch (error) {
    logger.error("Error creating claimable balance:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to create claimable balance",
    });
  }
});

// Production static file serving
if (process.env.NODE_ENV === "production") {
  app.use(express.static("frontend/build"));
  app.get("*", (req: Request, res: Response) => {
    res.sendFile(path.resolve(__dirname, "build", "index.html"));
  });
}

// ============================================
// SOCKET.IO EVENT HANDLERS
// ============================================

io.on("connection", (socket: Socket) => {
  activeConnections++;
  logger.info(`User ${socket.id} connected. Active connections: ${activeConnections}`);
  socket.emit("server_id", socket.id);

  // ============================================
  // RECONNECTION HANDLERS
  // ============================================

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
        logger.info(`User ${socket.id} attempting to rejoin room ${room} with address ${playerAddress}`);

        // Query Convex for game and player data
        let game = null;
        if (gameId) {
          const normalizedGameId = String(gameId).startsWith('game-') ? String(gameId).replace('game-', '') : String(gameId);
          game = await convex.query(api.games.byRoomId, { roomId: normalizedGameId });
        } else {
          const normalizedRoom = room.startsWith('game-') ? room.replace('game-', '') : room;
          game = await convex.query(api.games.byRoomId, { roomId: normalizedRoom });
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
            socket.join(String(gameId));
          }

          logger.info(`User ${socket.id} successfully rejoined room ${room}`);

          // Get updated player list
          const players = await convex.query(api.players.inGame, {
            gameId: game._id,
          });

          // Get player's display name
          const currentPlayer = players.find(p => p.walletAddress === playerAddress);
          const displayName = currentPlayer?.displayName || playerAddress;

          // Format players for frontend
          const formattedPlayers = players.map((player) => ({
            id: player.socketId || player.walletAddress,
            name: player.displayName || player.walletAddress,
            room: room,
            walletAddress: player.walletAddress,
          }));

          if (callback && typeof callback === "function") {
            callback({
              success: true,
              room,
              gameId,
              userName: displayName,
              reconnected: true,
            });
          }

          // Notify other players
          socket.to(room).emit("playerReconnected", {
            userId: socket.id,
            userName: displayName,
            room,
            timestamp: Date.now(),
          });

          socket.emit("reconnected", {
            room,
            gameId,
            userName: displayName,
          });

          // Send updated room data
          io.to(room).emit("roomData", { room, users: formattedPlayers });
          logger.info(`Sent updated room data to room ${room} with ${players.length} players`);
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

  // Game state sync handler
  socket.on(
    "requestGameStateSync",
    async ({ roomId, gameId }: { roomId: string; gameId?: number }) => {
      try {
        logger.info(`User ${socket.id} requesting game state sync for room ${roomId}, game ${gameId}`);

        // Query game from Convex
        let game: any = null;
        if (gameId) {
          const normalizedGameId = String(gameId).startsWith('game-') ? String(gameId).replace('game-', '') : String(gameId);
          game = await convex.query(api.games.byRoomId, { roomId: normalizedGameId });
        } else {
          const normalizedRoomId = roomId.startsWith('game-') ? roomId.replace('game-', '') : roomId;
          game = await convex.query(api.games.byRoomId, { roomId: normalizedRoomId });
        }

        if (game) {
          // Reconstruct the off-chain game state from stored data
          const offChainState = {
            id: game.roomId,
            players: game.players,
            isActive: game.isActive ?? true,
            currentPlayerIndex: game.currentPlayerIndex,
            lastActionTimestamp: game.lastActionTimestamp.toString(),
            turnCount: game.turnCount.toString(),
            directionClockwise: game.directionClockwise,
            playerHandsHash: game.playerHandsHash ? JSON.parse(game.playerHandsHash) : {},
            playerHands: game.playerHands ? JSON.parse(game.playerHands) : {},
            deckHash: game.deckHash || '',
            discardPileHash: game.discardPileHash || '',
            currentColor: game.currentColor || null,
            currentValue: game.currentValue || null,
            lastPlayedCardHash: game.lastPlayedCardHash || null,
            stateHash: game.stateHash || '',
            isStarted: game.isStarted ?? false,
          };

          // Parse card hash map if available
          const cardHashMap = game.cardHashMap ? JSON.parse(game.cardHashMap) : {};

          socket.emit(`gameStateSync-${roomId}`, {
            newState: offChainState,
            cardHashMap,
            restored: true,
          });
          logger.info(`Game state synced for user ${socket.id} in room ${roomId}`);
        } else {
          logger.warn(`No game state found for room ${roomId} or game ${gameId}`);
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

  // Join room handler
  socket.on("joinRoom", (roomId: string) => {
    socket.join(roomId);
    logger.info(`User ${socket.id} joined room ${roomId}`);
    io.to(roomId).emit("userJoined", socket.id);
  });

  // Create game room handler
  socket.on("createGameRoom", () => {
    logger.info(`Game room created by user`);
    io.emit("gameRoomCreated");
  });

  // Join game lobby
  socket.on(
    "join",
    async (
      payload: { room: string; address?: string },
      callback: (error?: string) => void
    ) => {
      try {
        // Get or create game
        logger.info(`User join the room ${payload.room}`);
        // Normalize roomId - remove 'game-' prefix if present
        const normalizedRoom = payload.room.startsWith('game-') ? payload.room.replace('game-', '') : payload.room;
        let game = await convex.query(api.games.byRoomId, { roomId: normalizedRoom });

        if (!game) {
          // Create new game
          const newGameId = await convex.mutation(api.games.create, {
            roomId: normalizedRoom,
            players: [],
          });
          game = await convex.query(api.games.byRoomId, { roomId: normalizedRoom });
        }

        if (!game) {
          return callback("Failed to create or find game");
        }

        // Get current players in the room to determine player number
        const connectedUsersInRoom = await convex.query(api.players.inGame, {
          gameId: game._id,
        });
        
        const numberOfUsersInRoom = connectedUsersInRoom.length;
        
        // Assign player name based on current number of connected users (Player 1-6)
        const playerName = `Player ${numberOfUsersInRoom + 1}`;

        // Upsert player in Convex with generated name
        if (payload.address) {
          await convex.mutation(api.players.upsert, {
            walletAddress: payload.address,
            displayName: playerName,
            socketId: socket.id,
            connected: true,
            currentGameId: game._id,
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

        // Format players for frontend
        const formattedPlayers = players.map((player) => ({
          id: player.socketId || player.walletAddress,
          name: player.displayName || player.walletAddress,
          room: payload.room,
          walletAddress: player.walletAddress,
        }));

        // Send room data to all users
        io.to(payload.room).emit("roomData", { room: payload.room, users: formattedPlayers });
        socket.emit("currentUserData", { name: playerName });
        logger.info(`Data: ${payload.room} joined as ${playerName} with users ${players}`);
        logger.info(`New user ${socket.id} joined as ${playerName} in room ${payload.room}`);
        callback();
      } catch (error) {
        logger.error("Error joining room:", error);
        callback((error as Error).message);
      }
    }
  );

  // Game started handler
  socket.on(
    "gameStarted",
    async (data: {
      roomId: string;
      newState: any;
      cardHashMap: any;
    }) => {
      try {
        const { roomId, newState, cardHashMap } = data;
        // Normalize roomId - remove 'game-' prefix if present
        const normalizedRoomId = roomId.startsWith('game-') ? roomId.replace('game-', '') : roomId;
        logger.info(`Game started in room ${normalizedRoomId}`);

        // Extract game ID and players from newState
        const gameId = newState.id;
        const playerAddresses = newState.players;

        // Get game by room ID
        const game = await convex.query(api.games.byRoomId, {
          roomId: normalizedRoomId,
        });

        if (!game) {
          logger.error(`Game ${gameId} not found`);
          return;
        }

        // Store the off-chain game state and card mappings in Convex
        await convex.mutation(api.games.updateState, {
          gameId: game._id,
          status: "Started",
          startedAt: Date.now(),
          isActive: newState.isActive,
          isStarted: newState.isStarted,
          currentPlayerIndex: newState.currentPlayerIndex,
          turnCount: Number(newState.turnCount),
          directionClockwise: newState.directionClockwise,
          currentColor: newState.currentColor,
          currentValue: newState.currentValue,
          lastPlayedCardHash: newState.lastPlayedCardHash,
          deckHash: newState.deckHash,
          discardPileHash: newState.discardPileHash,
          stateHash: newState.stateHash,
          playerHandsHash: JSON.stringify(newState.playerHandsHash),
          playerHands: JSON.stringify(newState.playerHands),
          cardHashMap: JSON.stringify(cardHashMap),
        });

        logger.info(`Game ${gameId} started with ${playerAddresses.length} players and state stored`);

        // Broadcast the game started event to all clients in the room
        io.to(normalizedRoomId).emit(`gameStarted-${normalizedRoomId}`, {
          newState,
          cardHashMap,
          roomId: normalizedRoomId,
        });
      } catch (error) {
        logger.error("Error starting game:", error);
      }
    }
  );

  // Play card handler
  socket.on(
    "playCard",
    async (data: {
      roomId: string;
      gameId: number;
      playerAddress: string;
      cardHash: string;
      chosenColor?: string;
    }) => {
      try {
        const { roomId, gameId, playerAddress, cardHash, chosenColor } = data;
        // Normalize roomId - remove 'game-' prefix if present
        const normalizedRoomId = roomId.startsWith('game-') ? roomId.replace('game-', '') : roomId;
        logger.info(`Card played in room ${normalizedRoomId} by ${playerAddress}`);

        // Get game
        const game = await convex.query(api.games.byRoomId, {
          roomId: normalizedRoomId,
        });

        if (!game) {
          logger.error(`Game ${gameId} not found`);
          return;
        }

        // Play card using Convex mutation
        // @ts-ignore - gameActions will be available after Convex type generation
        const result = await convex.mutation(api.gameActions.playCard, {
          gameId: game._id,
          playerAddress,
          cardHash,
          chosenColor,
        });

        if (result.success) {
          // Get updated game state
          const updatedGame = await convex.query(api.games.byRoomId, {
            roomId: normalizedRoomId,
          });

          // Broadcast to all clients in the room
          io.to(normalizedRoomId).emit(`cardPlayed-${normalizedRoomId}`, {
            action: {
              type: "playCard",
              player: playerAddress,
              cardHash,
            },
            newState: updatedGame,
            winner: result.winner,
          });

          logger.info(`Card played successfully in game ${gameId}`);
        } else {
          logger.error(`Failed to play card in game ${gameId}:`, result.error);
          socket.emit("error", { message: result.error });
        }
      } catch (error) {
        logger.error("Error playing card:", error);
        socket.emit("error", { message: "Failed to play card" });
      }
    }
  );

  // Draw card handler
  socket.on(
    "drawCard",
    async (data: { roomId: string; gameId: number; playerAddress: string }) => {
      try {
        const { roomId, gameId, playerAddress } = data;
        // Normalize roomId - remove 'game-' prefix if present
        const normalizedRoomId = roomId.startsWith('game-') ? roomId.replace('game-', '') : roomId;
        logger.info(`Card drawn in room ${normalizedRoomId} by ${playerAddress}`);

        // Get game
        const game = await convex.query(api.games.byRoomId, {
          roomId: normalizedRoomId,
        });

        if (!game) {
          logger.error(`Game ${gameId} not found`);
          return;
        }

        // Draw card using Convex mutation
        // @ts-ignore - gameActions will be available after Convex type generation
        const result = await convex.mutation(api.gameActions.drawCard, {
          gameId: game._id,
          playerAddress,
        });

        if (result.success) {
          // Get updated game state
          const updatedGame = await convex.query(api.games.byRoomId, {
            roomId: normalizedRoomId,
          });

          // Broadcast to all clients in the room
          io.to(normalizedRoomId).emit(`cardDrawn-${normalizedRoomId}`, {
            action: {
              type: "drawCard",
              player: playerAddress,
            },
            newState: updatedGame,
          });

          logger.info(`Card drawn successfully in game ${gameId}`);
        } else {
          logger.error(`Failed to draw card in game ${gameId}:`, result.error);
          socket.emit("error", { message: result.error });
        }
      } catch (error) {
        logger.error("Error drawing card:", error);
        socket.emit("error", { message: "Failed to draw card" });
      }
    }
  );

  // Leave room handler
  socket.on("leaveRoom", async (roomId: string) => {
    socket.leave(roomId);
    logger.info(`User ${socket.id} left room ${roomId}`);
    io.to(roomId).emit("userLeft", socket.id);
  });

  // Quit room handler
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
          const normalizedGameId = player.currentGameId.startsWith('game-') ? player.currentGameId.replace('game-', '') : player.currentGameId;
          const game = await convex.query(api.games.byRoomId, {
            roomId: normalizedGameId,
          });

          if (game) {
            const players = await convex.query(api.players.inGame, {
              gameId: game._id,
            });
            
            // Format players for frontend
            const formattedPlayers = players.map((p) => ({
              id: p.socketId || p.walletAddress,
              name: p.displayName || p.walletAddress,
              room: player.currentGameId,
              walletAddress: p.walletAddress,
            }));
            
            io.to(player.currentGameId).emit("roomData", {
              room: player.currentGameId,
              users: formattedPlayers,
            });
          }
        }
      }
    } catch (error) {
      logger.error("Error quitting room:", error);
    }
  });

  // Send message handler
  socket.on(
    "sendMessage",
    async (
      payload: { message: string },
      callback: () => void
    ) => {
      try {
        const player = await convex.query(api.players.bySocketId, {
          socketId: socket.id,
        });

        if (player && player.currentGameId) {
          const normalizedGameId = player.currentGameId.startsWith('game-') ? player.currentGameId.replace('game-', '') : player.currentGameId;
          const game = await convex.query(api.games.byRoomId, {
            roomId: normalizedGameId,
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

  // Disconnect handler
  socket.on("disconnect", async (reason: string) => {
    activeConnections--;
    logger.info(`User ${socket.id} disconnected: ${reason}. Active connections: ${activeConnections}`);

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

                logger.info(`User ${socket.id} did not reconnect, removed from game`);

                if (currentPlayer.currentGameId) {
                  const normalizedGameId = currentPlayer.currentGameId.startsWith('game-') ? currentPlayer.currentGameId.replace('game-', '') : currentPlayer.currentGameId;
                  const game = await convex.query(api.games.byRoomId, {
                    roomId: normalizedGameId,
                  });

                  if (game) {
                    const players = await convex.query(api.players.inGame, {
                      gameId: game._id,
                    });

                    // Format players for frontend
                    const formattedPlayers = players.map((p) => ({
                      id: p.socketId || p.walletAddress,
                      name: p.displayName || p.walletAddress,
                      room: currentPlayer.currentGameId,
                      walletAddress: p.walletAddress,
                    }));

                    io.to(currentPlayer.currentGameId).emit("roomData", {
                      room: currentPlayer.currentGameId,
                      users: formattedPlayers,
                    });

                    io.to(currentPlayer.currentGameId).emit("playerLeft", {
                      userId: socket.id,
                      userName: currentPlayer.displayName || currentPlayer.walletAddress,
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

  // Socket error handler
  socket.on("error", (error: Error) => {
    logger.error(`Socket ${socket.id} error:`, error);
  });
});

// ============================================
// SERVER LIFECYCLE
// ============================================

// Graceful shutdown
function gracefulShutdown() {
  logger.info("Shutting down gracefully...");
  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });

  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
}

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

// Global error handlers
process.on("uncaughtException", (error: Error) => {
  logger.error("Uncaught Exception:", error);
});

process.on("unhandledRejection", (reason: any, promise: Promise<any>) => {
  logger.error("Unhandled Rejection at:", { promise, reason });
});

// Start server
server.listen(PORT, () => {
  logger.info(`Server started on Port ${PORT} at ${new Date().toISOString()}`);
  logger.info(`Convex URL: ${convexUrl}`);
});
