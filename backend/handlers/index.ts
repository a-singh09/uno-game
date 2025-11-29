import { Socket } from "socket.io";
import { ConvexHttpClient } from "convex/browser";
import { setupReconnectionHandlers } from "./reconnectionHandlers";
import { setupRoomHandlers } from "./roomHandlers";
import { setupGameActionHandlers } from "./gameActionHandlers";
import { setupConnectionHandlers } from "./connectionHandlers";

/**
 * Register all socket event handlers for a connected client
 */
export function registerSocketHandlers(
  socket: Socket,
  io: any,
  convex: ConvexHttpClient,
  activeConnections: { count: number }
) {
  // Setup different handler groups
  setupReconnectionHandlers(socket, io, convex);
  setupRoomHandlers(socket, io, convex);
  setupGameActionHandlers(socket, io, convex);
  setupConnectionHandlers(socket, io, convex, activeConnections);
}
