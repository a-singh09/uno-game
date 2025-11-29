// Game actions - State storage only (game logic is in frontend)
import { mutation, query } from "./_generated/server";
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
    playDirection: v.union(
      v.literal("clockwise"),
      v.literal("counterclockwise")
    ),
    currentColor: v.optional(v.string()),
    currentNumber: v.optional(v.string()),
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

// Store complete game state from frontend (accepts frontend GameState format)
export const storeCompleteGameState = mutation({
  args: {
    roomId: v.string(),
    gameState: v.any(), // Frontend GameState object
  },
  handler: async (ctx, args) => {
    // Find game by roomId
    let game = await ctx.db
      .query("games")
      .withIndex("by_roomId", (q) => q.eq("roomId", args.roomId))
      .first();

    if (!game) {
      // Create new game if doesn't exist
      const gameId = await ctx.db.insert("games", {
        roomId: args.roomId,
        gameNumericId: Math.floor(Math.random() * 1000000).toString(),
        players: [], // Will populate from game state
        createdAt: Date.now(),
        startedAt: Date.now(),
        status: "Started",
        currentPlayerIndex: 0,
        turnCount: 0,
        playDirection: "clockwise",
        lastActionTimestamp: Date.now(),
      });
      game = await ctx.db.get(gameId);
    }

    if (!game) return { success: false, error: "Failed to create game" };

    const state = args.gameState;

    // Update game record
    const updates: any = {
      playDirection: state.playDirection || "clockwise",
      currentColor: state.currentColor,
      currentNumber: state.currentNumber,
      turnCount: state.turnCount || 0,
      lastActionTimestamp: Date.now(),
    };

    if (state.gameOver) {
      updates.status = "Ended";
      updates.endedAt = Date.now();
    }

    await ctx.db.patch(game._id, updates);

    return { success: true, gameId: game._id };
  },
});

// Store player hands from frontend GameState
export const storePlayerHands = mutation({
  args: {
    roomId: v.string(),
    players: v.array(v.string()), // Player wallet addresses
    hands: v.any(), // Object with player1Deck, player2Deck, etc.
  },
  handler: async (ctx, args) => {
    // Find game
    const game = await ctx.db
      .query("games")
      .withIndex("by_roomId", (q) => q.eq("roomId", args.roomId))
      .first();

    if (!game) {
      return { success: false, error: "Game not found" };
    }

    // Update players list if needed
    if (args.players && args.players.length > 0) {
      await ctx.db.patch(game._id, {
        players: args.players,
      });
    }

    // Store each player's hand
    for (let i = 0; i < args.players.length; i++) {
      const deckKey = `player${i + 1}Deck`;
      const deck = args.hands[deckKey];

      if (deck && Array.isArray(deck)) {
        const existing = await ctx.db
          .query("hands")
          .withIndex("by_game_player", (q) =>
            q.eq("gameId", game._id).eq("playerAddress", args.players[i])
          )
          .first();

        if (existing) {
          await ctx.db.patch(existing._id, {
            cardHashes: deck,
            updatedAt: Date.now(),
          });
        } else {
          await ctx.db.insert("hands", {
            gameId: game._id,
            playerAddress: args.players[i],
            cardHashes: deck,
            updatedAt: Date.now(),
          });
        }
      }
    }

    return { success: true };
  },
});

// Store card mappings (hash to card details)
export const storeCardMappings = mutation({
  args: {
    roomId: v.string(),
    cardMappings: v.any(), // Object: { hash: { color, value } }
  },
  handler: async (ctx, args) => {
    const game = await ctx.db
      .query("games")
      .withIndex("by_roomId", (q) => q.eq("roomId", args.roomId))
      .first();

    if (!game) {
      return { success: false, error: "Game not found" };
    }

    // Store each card mapping
    const mappings = Object.entries(args.cardMappings || {});

    for (const [hash, card] of mappings) {
      const cardObj = card as any;

      // Check if mapping already exists
      const existing = await ctx.db
        .query("cardMappings")
        .withIndex("by_game_hash", (q) =>
          q.eq("gameId", game._id).eq("cardHash", hash)
        )
        .first();

      if (!existing) {
        await ctx.db.insert("cardMappings", {
          gameId: game._id,
          cardHash: hash,
          color: cardObj.color || "wild",
          value: cardObj.value || cardObj.number?.toString() || "0",
        });
      }
    }

    return { success: true };
  },
});

// Get complete game state for reconnection (returns frontend GameState format)
export const getGameStateForReconnection = query({
  args: {
    roomId: v.string(),
    playerAddress: v.string(),
  },
  handler: async (ctx, args) => {
    // Find game
    const game = await ctx.db
      .query("games")
      .withIndex("by_roomId", (q) => q.eq("roomId", args.roomId))
      .first();

    if (!game) {
      return null;
    }

    // Get all player hands
    const hands = await ctx.db
      .query("hands")
      .withIndex("by_game_player", (q) => q.eq("gameId", game._id))
      .collect();

    // Get card mappings
    const cardMappings = await ctx.db
      .query("cardMappings")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect();

    // Build card mappings object
    const cardMappingsObj: any = {};
    for (const mapping of cardMappings) {
      cardMappingsObj[mapping.cardHash] = {
        color: mapping.color,
        value: mapping.value,
      };
    }

    // Build frontend-compatible GameState
    const gameState: any = {
      gameOver: game.status === "Ended",
      winner: "",
      turn: `Player ${(game.currentPlayerIndex || 0) + 1}`,
      currentColor: game.currentColor || "",
      currentNumber: game.currentNumber || "",
      playDirection: game.playDirection || "clockwise",
      totalPlayers: game.players.length,
      turnCount: game.turnCount || 0,
      playedCardsPile: [],
      drawCardPile: [],
      isUnoButtonPressed: false,
      drawButtonPressed: false,
      lastCardPlayedBy: "",
      isExtraTurn: false,
    };

    // Add player decks
    for (let i = 0; i < 6; i++) {
      const deckKey = `player${i + 1}Deck`;
      if (i < game.players.length) {
        const playerHand = hands.find(
          (h) => h.playerAddress === game.players[i]
        );
        gameState[deckKey] = playerHand ? playerHand.cardHashes : [];
      } else {
        gameState[deckKey] = [];
      }
    }

    return {
      gameState,
      cardMappings: cardMappingsObj,
      players: game.players,
    };
  },
});
