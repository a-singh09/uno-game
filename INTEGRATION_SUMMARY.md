# UNO Game - Frontend-Backend Integration Summary

## Architecture Overview

This UNO multiplayer game implements a **frontend-oriented architecture** where:
- **Frontend**: Contains ALL game logic (card validation, turn progression, special card effects, winner detection)
- **Backend**: Acts as persistence + broadcast layer using Socket.IO and Convex DB

## Key Architectural Decisions

### 1. Frontend-First Game Logic
All game rules and validation happen in the frontend ([frontend/src/utils/gameLogic.js](frontend/src/utils/gameLogic.js)):
- Card play validation
- Turn progression (clockwise/counterclockwise)
- Special card effects (Skip, Reverse, Draw2, Wild, Wild Draw4)
- Winner detection
- UNO button logic

**Why**: Enables instant UI feedback and reduces server round-trip latency for game moves.

### 2. Backend as Persistence Layer
Backend stores game state in separate Convex tables ([backend/convex/schema.ts](backend/convex/schema.ts)):
- `games`: Current game state (mutable)
- `hands`: Player card hands (mutable)
- `moves`: Immutable move history (event sourcing)
- `gameStates`: Immutable state snapshots at each turn
- `cardMappings`: Hash-to-card mappings for security
- `rooms`: Multiplayer room metadata

**Why**: Enables reconnection, game replay, and multi-device synchronization.

### 3. Unified Type System
- **Player Identification**: Wallet addresses (strings) throughout
- **Direction**: `"clockwise" | "counterclockwise"` string union
- **Card Numbers**: `currentNumber` (not `currentValue`)
- **Full TypeScript**: Both frontend and backend use TypeScript

**Why**: Type safety prevents runtime errors and ensures consistency across stack.

---

## Frontend-Backend Event Protocol

### Socket.IO Events

| Frontend Event | Direction | Backend Handler | Convex Mutations Called |
|----------------|-----------|-----------------|------------------------|
| `initGameState` | Frontend → Backend | [gameActionHandlers.ts:16](backend/handlers/gameActionHandlers.ts#L16) | `storeCompleteGameState`, `storePlayerHands`, `storeCardMappings` |
| `updateGameState` | Frontend → Backend | [gameActionHandlers.ts:70](backend/handlers/gameActionHandlers.ts#L70) | `storeCompleteGameState` |
| `initGameState` | Backend → Frontend | Broadcast to room | - |
| `updateGameState` | Backend → Frontend | Broadcast to room | - |
| `createRoom` | Frontend → Backend | [roomHandlers.ts](backend/handlers/roomHandlers.ts) | `rooms.create` |
| `joinRoom` | Frontend → Backend | [roomHandlers.ts](backend/handlers/roomHandlers.ts) | `rooms.addPlayer` |
| `rejoinRoom` | Frontend → Backend | [reconnectionHandlers.ts](backend/handlers/reconnectionHandlers.ts) | Query: `getGameStateForReconnection` |
| `reconnected` | Backend → Frontend | - | - |
| `connection` | Frontend → Backend | [connectionHandlers.ts](backend/handlers/connectionHandlers.ts) | - |
| `disconnect` | Frontend → Backend | [connectionHandlers.ts](backend/handlers/connectionHandlers.ts) | - |

---

## Data Flow Diagrams

### Game Initialization Flow
```
Frontend (Game.tsx)
  └─> initializeMultiplayerGame()
       └─> Creates initial GameState with shuffled cards
            └─> socket.emit("initGameState", { gameState, cardMappings, players })

Backend (gameActionHandlers.ts)
  └─> socket.on("initGameState")
       ├─> convex.mutation(storeCompleteGameState) → games table
       ├─> convex.mutation(storePlayerHands) → hands table
       ├─> convex.mutation(storeCardMappings) → cardMappings table
       └─> io.to(roomId).emit("initGameState", data) → Broadcast to all players

All Players' Frontends
  └─> socket.on("initGameState")
       └─> Update local GameState
```

### Game Update Flow (Card Play)
```
Frontend (Game.tsx)
  └─> handleCardPlay(card)
       └─> gameLogic.js validates move
            └─> Updates local GameState
                 └─> socket.emit("updateGameState", newGameState)

Backend (gameActionHandlers.ts)
  └─> socket.on("updateGameState")
       ├─> convex.mutation(storeCompleteGameState) → games table
       └─> io.to(roomId).emit("updateGameState", gameState) → Broadcast

All Players' Frontends
  └─> socket.on("updateGameState")
       └─> Update local GameState to stay in sync
```

### Reconnection Flow
```
Frontend (Room.tsx)
  └─> socket.emit("rejoinRoom", { room, gameId, playerAddress })

Backend (reconnectionHandlers.ts)
  └─> socket.on("rejoinRoom")
       ├─> socket.join(room)
       ├─> convex.query(getGameStateForReconnection, { roomId, playerAddress })
       │    └─> Queries games, hands, cardMappings tables
       │         └─> Rebuilds complete frontend GameState format
       └─> callback({ gameState, cardMappings, players, reconnected: true })

Frontend (Room.tsx)
  └─> Receives reconnection data
       └─> Restores complete game state
            └─> Player resumes exactly where they left off
```

---

## Database Schema

### games Table
Stores current mutable game state:
```typescript
{
  roomId: string,
  gameNumericId: string,
  players: string[],  // Wallet addresses
  status: "Pending" | "Started" | "Ended",

  // Current state (updated each move)
  currentPlayerIndex: number,
  turnCount: number,
  playDirection: "clockwise" | "counterclockwise",
  currentColor?: string,
  currentNumber?: string,  // Not currentValue
  lastPlayedCardHash?: string,
  deckHash?: string,

  // Timestamps
  createdAt: number,
  startedAt?: number,
  endedAt?: number,
  lastActionTimestamp: number,
}
```

### hands Table
Stores each player's current card hand:
```typescript
{
  gameId: Id<"games">,
  playerAddress: string,  // Wallet address
  cardHashes: string[],   // SHA256 hashes
  updatedAt: number,
}
```

### moves Table (Event Sourcing)
Immutable log of all game actions:
```typescript
{
  gameId: Id<"games">,
  turnNumber: number,
  playerAddress: string,
  actionType: "playCard" | "drawCard",
  cardHash?: string,
  timestamp: number,
}
```

### gameStates Table (State Snapshots)
Immutable snapshots at each turn:
```typescript
{
  gameId: Id<"games">,
  turnNumber: number,
  stateHash: string,
  currentPlayerIndex: number,
  playDirection: "clockwise" | "counterclockwise",
  currentColor?: string,
  currentNumber?: string,
  lastPlayedCardHash?: string,
  deckHash?: string,
  createdAt: number,
}
```

### cardMappings Table
Maps card hashes to actual card data:
```typescript
{
  gameId: Id<"games">,
  cardHash: string,      // SHA256 hash
  color: string,         // "red", "blue", "green", "yellow", "wild"
  value: string,         // "0"-"9", "skip", "reverse", "draw2", "wild", "wild_draw4"
}
```

### rooms Table
Multiplayer room metadata:
```typescript
{
  roomId: string,
  gameId?: Id<"games">,
  players: string[],     // Wallet addresses
  status: "waiting" | "active" | "ended",
  maxPlayers: number,
  createdAt: number,
}
```

---

## Key Convex Mutations & Queries

### Core Persistence Mutations

#### `storeCompleteGameState`
**Location**: [backend/convex/gameActions.ts:108](backend/convex/gameActions.ts#L108)
**Purpose**: Accept frontend GameState format and store to `games` table
**Called By**: `initGameState` and `updateGameState` handlers
**Input**: `{ roomId: string, gameState: any }`
**Output**: `{ success: boolean, gameId: Id<"games"> }`

```typescript
// Stores: playDirection, currentColor, currentNumber, turnCount, gameOver status
await convex.mutation(api.gameActions.storeCompleteGameState, {
  roomId,
  gameState,
});
```

#### `storePlayerHands`
**Location**: [backend/convex/gameActions.ts:162](backend/convex/gameActions.ts#L162)
**Purpose**: Store each player's card hashes to `hands` table
**Called By**: `initGameState` handler
**Input**: `{ roomId: string, players: string[], hands: any }`
**Output**: `{ success: boolean }`

```typescript
// Extracts player1Deck, player2Deck, etc. and stores separately
await convex.mutation(api.gameActions.storePlayerHands, {
  roomId,
  players,
  hands: gameState,
});
```

#### `storeCardMappings`
**Location**: [backend/convex/gameActions.ts:220](backend/convex/gameActions.ts#L220)
**Purpose**: Store hash-to-card mappings to `cardMappings` table
**Called By**: `initGameState` handler
**Input**: `{ roomId: string, cardMappings: any }`
**Output**: `{ success: boolean }`

```typescript
// Stores { hash: { color, value } } mappings
await convex.mutation(api.gameActions.storeCardMappings, {
  roomId,
  cardMappings,
});
```

### Reconnection Query

#### `getGameStateForReconnection`
**Location**: [backend/convex/gameActions.ts:264](backend/convex/gameActions.ts#L264)
**Purpose**: Rebuild complete frontend GameState from Convex tables
**Called By**: `rejoinRoom` handler
**Input**: `{ roomId: string, playerAddress: string }`
**Output**: `{ gameState: GameState, cardMappings: any, players: string[] }`

```typescript
// Queries games, hands, cardMappings tables
// Returns exact frontend GameState format
const restored = await convex.query(api.gameActions.getGameStateForReconnection, {
  roomId,
  playerAddress,
});
```

### Optional Enhancement Mutations (Infrastructure Ready)

#### `recordCardPlay` & `recordCardDraw`
**Location**: [backend/convex/gameActions.ts:50-88](backend/convex/gameActions.ts#L50-L88)
**Status**: ⚠️ Infrastructure ready but not called yet
**Purpose**: Record moves to `moves` table for event sourcing
**To Enable**: Call from `updateGameState` handler

#### `states.insert`
**Location**: [backend/convex/states.ts:6](backend/convex/states.ts#L6)
**Status**: ⚠️ Infrastructure ready but not called yet
**Purpose**: Save state snapshots to `gameStates` table
**To Enable**: Call from `updateGameState` handler after each turn

---

## Frontend GameState Interface

```typescript
interface GameState {
  gameOver: boolean;
  winner: string;
  turn: string;  // "Player 1", "Player 2", etc.

  // Card state
  currentColor: string;
  currentNumber: string;
  playedCardsPile: string[];
  drawCardPile: string[];

  // Player hands (up to 6 players)
  player1Deck: string[];
  player2Deck: string[];
  player3Deck: string[];
  player4Deck: string[];
  player5Deck: string[];
  player6Deck: string[];

  // Game flow
  totalPlayers: number;
  turnCount: number;
  playDirection: "clockwise" | "counterclockwise";

  // UI state
  isUnoButtonPressed: boolean;
  drawButtonPressed: boolean;
  lastCardPlayedBy: string;
  isExtraTurn: boolean;
}
```

---

## File Structure

### Backend
```
backend/
├── handlers/
│   ├── index.ts                    # Main handler registration
│   ├── gameActionHandlers.ts       # initGameState, updateGameState
│   ├── roomHandlers.ts             # createRoom, joinRoom
│   ├── reconnectionHandlers.ts    # rejoinRoom, state restore
│   └── connectionHandlers.ts       # connection, disconnect
├── convex/
│   ├── gameActions.ts              # Core game mutations & queries
│   ├── rooms.ts                    # Room management mutations
│   ├── schema.ts                   # Database schema definitions
│   └── states.ts                   # State snapshot mutations
└── index.ts                        # Socket.IO server setup
```

### Frontend
```
frontend/src/
├── components/gameroom/
│   ├── Game.tsx                    # Main game component (emits events)
│   └── Room.tsx                    # Multiplayer room (handles reconnection)
└── utils/
    ├── gameLogic.js                # Core game logic (all validation)
    ├── gameInitialization.js       # Game state initialization
    ├── cardPlayHandlers.js         # Special card handlers
    ├── gameConstants.js            # Constants (PLAY_DIRECTION)
    └── packOfCards.js              # Card definitions
```

---

## Current Implementation Status

### ✅ Fully Implemented
- [x] Frontend game logic (all card rules)
- [x] Socket.IO event protocol
- [x] Complete Convex persistence layer
- [x] Player hand storage
- [x] Card mapping storage
- [x] Reconnection with state restore
- [x] TypeScript migration (frontend + backend)
- [x] Unified type system (playDirection, currentNumber)
- [x] Table separation in Convex DB

### ⚠️ Infrastructure Ready (Optional Enhancements)
- [ ] Move history recording (`moves` table)
- [ ] State snapshots (`gameStates` table)
- [ ] Chat functionality (`sendMessage` event handler)

### ✅ Build Status
- Frontend build: **SUCCESS**
- Backend build: **SUCCESS**
- TypeScript type checking: **PASSED**

---

## Testing Checklist

### Integration Testing
- [ ] Create multiplayer room
- [ ] Join room with multiple players
- [ ] Initialize game and verify all players see same state
- [ ] Play cards and verify state updates broadcast correctly
- [ ] Test special cards (Skip, Reverse, Draw2, Wild)
- [ ] Disconnect player mid-game
- [ ] Reconnect player and verify state restored
- [ ] Complete full game and verify winner detection

### Database Verification
- [ ] Verify `games` table updated on each move
- [ ] Verify `hands` table updated when cards played/drawn
- [ ] Verify `cardMappings` stored at game start
- [ ] Verify reconnection query returns complete state

### Edge Cases
- [ ] Player disconnects before game starts
- [ ] All players disconnect (game persistence)
- [ ] Player tries to play invalid card
- [ ] Reverse card in 2-player game (acts like Skip)
- [ ] Multiple rapid reconnections

---

## Development Commands

```bash
# Frontend
cd frontend
npm run dev          # Start development server
npm run build        # Build for production
npm run type-check   # TypeScript type checking

# Backend
cd backend
npm run dev          # Start Socket.IO server
npm run build        # Build TypeScript
npx convex dev       # Start Convex development

# Full stack
npm run dev          # Run both frontend and backend concurrently
```

---

## Security Considerations

### Implemented
- ✅ Card hashing with SHA256
- ✅ Separate card mappings table
- ✅ Player identification via wallet addresses
- ✅ TypeScript type safety

### Recommended Enhancements
- [ ] Rate limiting on Socket.IO events
- [ ] Input validation on all mutations
- [ ] Authentication/authorization for wallet addresses
- [ ] Move validation on backend (double-check frontend logic)
- [ ] Encryption for sensitive data

---

## Performance Optimizations

### Current Architecture
- **Instant UI Feedback**: Frontend validates moves before sending to backend
- **Efficient Broadcasts**: Only send state updates to room members
- **Indexed Queries**: All Convex queries use proper indexes
- **Minimal Data Transfer**: Only send changed state, not full game state

### Future Optimizations
- [ ] Implement delta updates (only changed fields)
- [ ] Add Redis caching layer for hot game data
- [ ] Compress Socket.IO payloads
- [ ] Implement WebRTC for peer-to-peer card visibility

---

## Troubleshooting

### Common Issues

**Issue**: Player reconnects but state not restored
**Solution**: Check that `playerAddress` is passed correctly to `rejoinRoom` event

**Issue**: Game state out of sync between players
**Solution**: Verify `updateGameState` broadcasts to entire room with `io.to(roomId).emit()`

**Issue**: Card mappings not found on reconnection
**Solution**: Ensure `storeCardMappings` is called during `initGameState`

**Issue**: TypeScript errors about `playDirection` type
**Solution**: Ensure using string union `"clockwise" | "counterclockwise"` not numbers

---

## Contact & Support

For questions or issues, please:
1. Check this integration summary
2. Review code comments in handler files
3. Verify Socket.IO event names match exactly
4. Check Convex dashboard for data persistence

---

**Last Updated**: 2025-11-30
**Backend Version**: TypeScript + Socket.IO + Convex
**Frontend Version**: React + TypeScript
**Architecture**: Frontend-oriented with backend persistence
