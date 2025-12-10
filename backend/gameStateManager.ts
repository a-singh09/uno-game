import fs from 'fs';
import path from 'path';
import logger from './logger';
import RedisStorage from './services/redisStorage';
import {
  GAME_STATE_TTL_MS,
  FILE_PERSIST_INTERVAL_MS,
  MAX_STORED_GAMES,
} from './constants';

interface GameStatePayload {
  state: any;
  updatedAt: number;
  gameId?: string | number;
  roomId: string;
}

class GameStateManager {
  private redisStorage: RedisStorage;
  private useRedis: boolean;
  private gameStates: Map<string, GameStatePayload>;
  private cardHashMaps: Map<string, any>;
  private filePath: string;

  constructor() {
    this.redisStorage = new RedisStorage();
    this.useRedis = this.redisStorage.isEnabled();
    this.gameStates = new Map(); // roomId -> { state, updatedAt, gameId }
    this.cardHashMaps = new Map(); // roomId -> map
    this.filePath = path.join(__dirname, 'game-states.json');

    this.loadFromDisk();
    setInterval(() => this.persistToDisk(), FILE_PERSIST_INTERVAL_MS);
  }

  async saveGameState(roomId: string, state: any): Promise<void> {
    const payload: GameStatePayload = {
      state,
      updatedAt: Date.now(),
      gameId: state?.id,
      roomId,
    };
    this.gameStates.set(roomId, payload);
    if (this.useRedis) {
      await this.redisStorage.saveGameState(roomId, payload);
    }
  }

  async saveCardHashMap(roomId: string, cardHashMap: any): Promise<void> {
    this.cardHashMaps.set(roomId, cardHashMap);
    if (this.useRedis) {
      await this.redisStorage.saveCardHashMap(roomId, cardHashMap);
    }
  }

  async getGameState(roomId: string): Promise<GameStatePayload | null> {
    if (this.useRedis) {
      const redisState = await this.redisStorage.getGameState(roomId);
      if (redisState) return redisState;
    }
    return this.gameStates.get(roomId) || null;
  }

  async getCardHashMap(roomId: string): Promise<any> {
    if (this.useRedis) {
      const redisMap = await this.redisStorage.getCardHashMap(roomId);
      if (redisMap) return redisMap;
    }
    return this.cardHashMaps.get(roomId) || null;
  }

  async deleteGameState(roomId: string): Promise<void> {
    this.gameStates.delete(roomId);
    this.cardHashMaps.delete(roomId);
    if (this.useRedis) {
      await this.redisStorage.deleteGameState(roomId);
    }
  }

  async getByGameId(gameId: string | number): Promise<GameStatePayload | null> {
    // Try in-memory first
    for (const [, value] of this.gameStates.entries()) {
      if (String(value.gameId) === String(gameId)) {
        return value;
      }
    }
    // Redis fallback
    if (this.useRedis) {
      // Inefficient without an index; rely on room lookups from client
      return null;
    }
    return null;
  }

  cleanupOldStates(): void {
    const now = Date.now();
    for (const [roomId, value] of this.gameStates.entries()) {
      if (now - value.updatedAt > GAME_STATE_TTL_MS) {
        this.gameStates.delete(roomId);
        this.cardHashMaps.delete(roomId);
      }
    }
  }

  persistToDisk(): void {
    try {
      const entries = Array.from(this.gameStates.values())
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, MAX_STORED_GAMES);
      fs.writeFileSync(this.filePath, JSON.stringify(entries, null, 2), 'utf8');
    } catch (err: any) {
      logger.error('Failed to persist game states: %s', err.message);
    }
  }

  loadFromDisk(): void {
    try {
      if (!fs.existsSync(this.filePath)) return;
      const raw = fs.readFileSync(this.filePath, 'utf8');
      if (!raw) return;
      const entries = JSON.parse(raw);
      entries.forEach((entry: GameStatePayload) => {
        if (entry.roomId && entry.state) {
          this.gameStates.set(entry.roomId, entry);
        }
      });
    } catch (err: any) {
      logger.warn('No persisted game states loaded: %s', err.message);
    }
  }

  counts(): { gameStates: number; activeRooms: number } {
    return {
      gameStates: this.gameStates.size,
      activeRooms: this.gameStates.size,
    };
  }

  isRedisEnabled(): boolean {
    return this.useRedis;
  }
}

export default new GameStateManager();
export { GameStateManager, GameStatePayload };
