import express, { Request, Response } from "express";
import cors from "cors";
import http from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import ws from "ws";
import path from "path";
import { ConvexHttpClient } from "convex/browser";
// @ts-ignore
import { api } from "./convex/_generated/api";
import logger from "./logger";
import { getGameState } from "./controllers/getGameState";
import { registerSocketHandlers } from "./handlers";

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
  wsEngine: ws.Server,
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

// Track active connections (using object to pass by reference)
const activeConnections = { count: 0 };

// ============================================
// API ENDPOINTS
// ============================================

// Health check endpoint
app.get("/health", async (req: Request, res: Response) => {
  try {
    const games = await convex.query(api.games.listAll);
    const activeGames = games.filter((g) => g.status === "Started");

    res.status(200).json({
      status: "ok",
      connections: activeConnections.count,
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
  const result = await getGameState(convex, req.params.gameId);

  if (result.success) {
    return res.status(200).json(result);
  } else {
    const statusCode =
      result.error === "Game state not found"
        ? 404
        : result.error === "Game ID is required" ||
            result.error === "Invalid game ID format"
          ? 400
          : 500;
    return res.status(statusCode).json(result);
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

// Create claimable balance endpoint
app.post(
  "/api/create-claimable-balance",
  async (req: Request, res: Response) => {
    try {
      const { winnerAddress, gameId } = req.body;

      if (!winnerAddress) {
        return res.status(400).json({ error: "Winner address is required" });
      }

      const { createClaimableBalance } = await import("./diamnetService");
      const result = await createClaimableBalance(winnerAddress);

      return res.status(200).json(result);
    } catch (error) {
      logger.error("Error creating claimable balance:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to create claimable balance",
      });
    }
  }
);

// Production static file serving
if (process.env.NODE_ENV === "production") {
  app.use(express.static("frontend/build"));
  app.get("*", (req: Request, res: Response) => {
    res.sendFile(path.resolve(__dirname, "build", "index.html"));
  });
}

// ============================================
// SOCKET.IO CONNECTION HANDLER
// ============================================

io.on("connection", (socket: Socket) => {
  activeConnections.count++;
  logger.info(
    `User ${socket.id} connected. Active connections: ${activeConnections.count}`
  );
  socket.emit("server_id", socket.id);

  // Register all socket event handlers
  registerSocketHandlers(socket, io, convex, activeConnections);
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
