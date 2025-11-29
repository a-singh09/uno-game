// Game actions - State storage only (game logic is in frontend)
import { mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * IMPORTANT: The frontend handles ALL game logic.
 * Backend only stores state and broadcasts to other players.
 *
 * Frontend (gameLogic.ts) handles:
 * - Card validation
 * - Turn progression
 * - Special card effects (skip, reverse, draw2, wild_draw4)
 * - Winner detection
 *
 * Backend responsibilities:
 * - Store game state
 * - Store player hands
 * - Broadcast state changes via Socket.IO
 * - Enable reconnection/state sync
 */

// Update game state after frontend processes a move
export const updateGameState = mutation({
  args: {
    gameId: v.id("games"),
    currentPlayerIndex: v.number(),
    turnCount: v.number(),
    direction: v.union(v.literal("clockwise"), v.literal("counterclockwise")),
    currentColor: v.optional(v.string()),
    currentValue: v.optional(v.string()),
    lastPlayedCardHash: v.optional(v.string()),
    deckHash: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { gameId, ...updates } = args;

    await ctx.db.patch(gameId, {
      ...updates,
      lastActionTimestamp: Date.now(),
    });

    return { success: true };
  },
});

// Record a card play (for move history)
export const recordCardPlay = mutation({
  args: {
    gameId: v.id("games"),
    playerAddress: v.string(),
    cardHash: v.string(),
    turnNumber: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("moves", {
      gameId: args.gameId,
      turnNumber: args.turnNumber,
      playerAddress: args.playerAddress,
      actionType: "playCard",
      cardHash: args.cardHash,
      timestamp: Date.now(),
    });

    return { success: true };
  },
});

// Record a card draw (for move history)
export const recordCardDraw = mutation({
  args: {
    gameId: v.id("games"),
    playerAddress: v.string(),
    turnNumber: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("moves", {
      gameId: args.gameId,
      turnNumber: args.turnNumber,
      playerAddress: args.playerAddress,
      actionType: "drawCard",
      timestamp: Date.now(),
    });

    return { success: true };
  },
});

// End game
export const endGame = mutation({
  args: {
    gameId: v.id("games"),
    winnerAddress: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.gameId, {
      status: "Ended",
      endedAt: Date.now(),
    });

    return { success: true, winner: args.winnerAddress };
  },
});
