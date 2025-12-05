const logger = require('../logger');
const { getDataClient, isRedisEnabled } = require('../config/redis');

// Key prefixes for Redis
const KEYS = {
  GAME_STATE: 'game:state:',
  CARD_HASH_MAP: 'game:cardhash:',
  GAME_METADATA: 'game:metadata:',
  USER: 'user:',
  ROOM_USERS: 'room:users:',
  ALL_USERS: 'users:all',
};

// TTL for game states (1 hour in seconds)
const GAME_STATE_TTL = 3600;
// TTL for user data (24 hours in seconds)
const USER_TTL = 86400;

/**
 * Redis Storage Service
 * Provides Redis-backed storage operations with fallback to in-memory storage
 */
class RedisStorageService {
  constructor() {
    this.localCache = new Map(); // Fallback in-memory storage
  }

  /**
   * Get Redis client or null if not available
   */
  getClient() {
    if (!isRedisEnabled()) return null;
    return getDataClient();
  }

  /**
   * Save game state to Redis
   * @param {string} roomId - Room identifier
   * @param {object} gameState - Game state object
   * @param {object} cardHashMap - Card hash map (optional)
   * @returns {Promise<boolean>} Success status
   */
  async saveGameState(roomId, gameState, cardHashMap = null) {
    const client = this.getClient();
    
    try {
      const data = {
        state: gameState,
        lastUpdated: Date.now(),
      };

      if (client) {
        const pipeline = client.pipeline();
        
        pipeline.setex(
          KEYS.GAME_STATE + roomId,
          GAME_STATE_TTL,
          JSON.stringify(data)
        );
        
        if (cardHashMap) {
          pipeline.setex(
            KEYS.CARD_HASH_MAP + roomId,
            GAME_STATE_TTL,
            JSON.stringify(cardHashMap)
          );
        }

        // Save metadata for persistence
        if (gameState && gameState.id) {
          const gameId = gameState.id.toString();
          const metadata = {
            players: gameState.players || [],
            startTime: gameState.lastActionTimestamp || Date.now(),
            lastActivity: Date.now(),
            roomId: roomId,
            isStarted: gameState.isStarted || false,
            turnCount: gameState.turnCount?.toString() || '0',
          };
          pipeline.setex(
            KEYS.GAME_METADATA + gameId,
            GAME_STATE_TTL,
            JSON.stringify(metadata)
          );
        }

        await pipeline.exec();
        logger.debug(`Game state saved to Redis for room ${roomId}`);
      } else {
        // Fallback to in-memory storage
        this.localCache.set(KEYS.GAME_STATE + roomId, data);
        if (cardHashMap) {
          this.localCache.set(KEYS.CARD_HASH_MAP + roomId, cardHashMap);
        }
        if (gameState && gameState.id) {
          const gameId = gameState.id.toString();
          this.localCache.set(KEYS.GAME_METADATA + gameId, {
            players: gameState.players || [],
            startTime: gameState.lastActionTimestamp || Date.now(),
            lastActivity: Date.now(),
            roomId: roomId,
            isStarted: gameState.isStarted || false,
            turnCount: gameState.turnCount?.toString() || '0',
          });
        }
        logger.debug(`Game state saved to memory for room ${roomId}`);
      }

      return true;
    } catch (error) {
      logger.error(`Error saving game state for room ${roomId}:`, error);
      return false;
    }
  }

  /**
   * Get game state from Redis
   * @param {string} roomId - Room identifier
   * @returns {Promise<object|null>} Game state or null
   */
  async getGameState(roomId) {
    const client = this.getClient();

    try {
      if (client) {
        const data = await client.get(KEYS.GAME_STATE + roomId);
        if (data) {
          const parsed = JSON.parse(data);
          logger.debug(`Game state retrieved from Redis for room ${roomId}`);
          return parsed.state;
        }
      } else {
        const cached = this.localCache.get(KEYS.GAME_STATE + roomId);
        if (cached) {
          logger.debug(`Game state retrieved from memory for room ${roomId}`);
          return cached.state;
        }
      }

      logger.debug(`No game state found for room ${roomId}`);
      return null;
    } catch (error) {
      logger.error(`Error getting game state for room ${roomId}:`, error);
      return null;
    }
  }

  /**
   * Get game state by game ID
   * @param {string} gameId - Game identifier
   * @returns {Promise<object|null>} Game data or null
   */
  async getGameStateByGameId(gameId) {
    const client = this.getClient();

    try {
      if (client) {
        const metadata = await client.get(KEYS.GAME_METADATA + gameId);
        if (metadata) {
          const parsedMetadata = JSON.parse(metadata);
          const roomId = parsedMetadata.roomId;
          
          const [stateData, cardHashMap] = await Promise.all([
            client.get(KEYS.GAME_STATE + roomId),
            client.get(KEYS.CARD_HASH_MAP + roomId),
          ]);

          if (stateData) {
            const parsedState = JSON.parse(stateData);
            logger.debug(`Game state retrieved for game ID ${gameId}`);
            return {
              roomId,
              state: parsedState.state,
              cardHashMap: cardHashMap ? JSON.parse(cardHashMap) : null,
              metadata: parsedMetadata,
            };
          }
        }
      } else {
        // Search in local cache
        for (const [key, value] of this.localCache.entries()) {
          if (key.startsWith(KEYS.GAME_STATE)) {
            if (value.state?.id?.toString() === gameId.toString()) {
              const roomId = key.replace(KEYS.GAME_STATE, '');
              return {
                roomId,
                state: value.state,
                cardHashMap: this.localCache.get(KEYS.CARD_HASH_MAP + roomId),
                metadata: this.localCache.get(KEYS.GAME_METADATA + gameId),
              };
            }
          }
        }
      }

      logger.debug(`No game state found for game ID ${gameId}`);
      return null;
    } catch (error) {
      logger.error(`Error getting game state for game ID ${gameId}:`, error);
      return null;
    }
  }

  /**
   * Get card hash map from Redis
   * @param {string} roomId - Room identifier
   * @returns {Promise<object|null>} Card hash map or null
   */
  async getCardHashMap(roomId) {
    const client = this.getClient();

    try {
      if (client) {
        const data = await client.get(KEYS.CARD_HASH_MAP + roomId);
        if (data) {
          logger.debug(`Card hash map retrieved from Redis for room ${roomId}`);
          return JSON.parse(data);
        }
      } else {
        const cached = this.localCache.get(KEYS.CARD_HASH_MAP + roomId);
        if (cached) {
          return cached;
        }
      }

      return null;
    } catch (error) {
      logger.error(`Error getting card hash map for room ${roomId}:`, error);
      return null;
    }
  }

  /**
   * Delete game state from Redis
   * @param {string} roomId - Room identifier
   * @returns {Promise<boolean>} Success status
   */
  async deleteGameState(roomId) {
    const client = this.getClient();

    try {
      if (client) {
        const pipeline = client.pipeline();
        pipeline.del(KEYS.GAME_STATE + roomId);
        pipeline.del(KEYS.CARD_HASH_MAP + roomId);
        await pipeline.exec();
        logger.info(`Game state deleted from Redis for room ${roomId}`);
      } else {
        this.localCache.delete(KEYS.GAME_STATE + roomId);
        this.localCache.delete(KEYS.CARD_HASH_MAP + roomId);
        logger.info(`Game state deleted from memory for room ${roomId}`);
      }

      return true;
    } catch (error) {
      logger.error(`Error deleting game state for room ${roomId}:`, error);
      return false;
    }
  }

  /**
   * Check if game state exists
   * @param {string} roomId - Room identifier
   * @returns {Promise<boolean>}
   */
  async hasGameState(roomId) {
    const client = this.getClient();

    try {
      if (client) {
        const exists = await client.exists(KEYS.GAME_STATE + roomId);
        return exists === 1;
      } else {
        return this.localCache.has(KEYS.GAME_STATE + roomId);
      }
    } catch (error) {
      logger.error(`Error checking game state for room ${roomId}:`, error);
      return false;
    }
  }

  /**
   * Get all active rooms
   * @returns {Promise<string[]>} Array of room IDs
   */
  async getActiveRooms() {
    const client = this.getClient();

    try {
      if (client) {
        const keys = await client.keys(KEYS.GAME_STATE + '*');
        return keys.map((key) => key.replace(KEYS.GAME_STATE, ''));
      } else {
        const rooms = [];
        for (const key of this.localCache.keys()) {
          if (key.startsWith(KEYS.GAME_STATE)) {
            rooms.push(key.replace(KEYS.GAME_STATE, ''));
          }
        }
        return rooms;
      }
    } catch (error) {
      logger.error('Error getting active rooms:', error);
      return [];
    }
  }

  /**
   * Save user to Redis
   * @param {object} user - User object
   * @returns {Promise<boolean>} Success status
   */
  async saveUser(user) {
    const client = this.getClient();

    try {
      if (client) {
        const pipeline = client.pipeline();
        
        // Save user data
        pipeline.setex(KEYS.USER + user.id, USER_TTL, JSON.stringify(user));
        
        // Add to room's user set
        pipeline.sadd(KEYS.ROOM_USERS + user.room, user.id);
        
        // Add to all users set
        pipeline.sadd(KEYS.ALL_USERS, user.id);
        
        await pipeline.exec();
        logger.debug(`User ${user.id} saved to Redis in room ${user.room}`);
      } else {
        this.localCache.set(KEYS.USER + user.id, user);
      }

      return true;
    } catch (error) {
      logger.error(`Error saving user ${user.id}:`, error);
      return false;
    }
  }

  /**
   * Get user from Redis
   * @param {string} id - User ID
   * @returns {Promise<object|null>} User object or null
   */
  async getUser(id) {
    const client = this.getClient();

    try {
      if (client) {
        const data = await client.get(KEYS.USER + id);
        if (data) {
          return JSON.parse(data);
        }
      } else {
        return this.localCache.get(KEYS.USER + id) || null;
      }

      return null;
    } catch (error) {
      logger.error(`Error getting user ${id}:`, error);
      return null;
    }
  }

  /**
   * Remove user from Redis
   * @param {string} id - User ID
   * @returns {Promise<object|null>} Removed user or null
   */
  async removeUser(id) {
    const client = this.getClient();

    try {
      const user = await this.getUser(id);
      if (!user) return null;

      if (client) {
        const pipeline = client.pipeline();
        pipeline.del(KEYS.USER + id);
        pipeline.srem(KEYS.ROOM_USERS + user.room, id);
        pipeline.srem(KEYS.ALL_USERS, id);
        await pipeline.exec();
        logger.info(`User ${id} removed from Redis`);
      } else {
        this.localCache.delete(KEYS.USER + id);
      }

      return user;
    } catch (error) {
      logger.error(`Error removing user ${id}:`, error);
      return null;
    }
  }

  /**
   * Update user in Redis
   * @param {string} id - User ID
   * @param {object} updates - Fields to update
   * @returns {Promise<object|null>} Updated user or null
   */
  async updateUser(id, updates) {
    const client = this.getClient();

    try {
      const user = await this.getUser(id);
      if (!user) return null;

      const updatedUser = { ...user, ...updates };
      
      if (client) {
        await client.setex(KEYS.USER + id, USER_TTL, JSON.stringify(updatedUser));
      } else {
        this.localCache.set(KEYS.USER + id, updatedUser);
      }

      return updatedUser;
    } catch (error) {
      logger.error(`Error updating user ${id}:`, error);
      return null;
    }
  }

  /**
   * Get all users in a room
   * @param {string} room - Room ID
   * @returns {Promise<object[]>} Array of users
   */
  async getUsersInRoom(room) {
    const client = this.getClient();

    try {
      if (client) {
        const userIds = await client.smembers(KEYS.ROOM_USERS + room);
        if (userIds.length === 0) return [];

        const pipeline = client.pipeline();
        userIds.forEach((id) => pipeline.get(KEYS.USER + id));
        const results = await pipeline.exec();

        return results
          .filter(([err, data]) => !err && data)
          .map(([, data]) => JSON.parse(data))
          .filter((user) => user.room === room);
      } else {
        const users = [];
        for (const [key, value] of this.localCache.entries()) {
          if (key.startsWith(KEYS.USER) && value.room === room) {
            users.push(value);
          }
        }
        return users;
      }
    } catch (error) {
      logger.error(`Error getting users in room ${room}:`, error);
      return [];
    }
  }

  /**
   * Find user by name and room
   * @param {string} name - User name
   * @param {string} room - Room ID
   * @returns {Promise<object|null>} User or null
   */
  async findUserByNameAndRoom(name, room) {
    try {
      const users = await this.getUsersInRoom(room);
      return users.find((u) => u.name === name) || null;
    } catch (error) {
      logger.error(`Error finding user by name ${name} in room ${room}:`, error);
      return null;
    }
  }

  /**
   * Get all users
   * @returns {Promise<object[]>} Array of all users
   */
  async getAllUsers() {
    const client = this.getClient();

    try {
      if (client) {
        const userIds = await client.smembers(KEYS.ALL_USERS);
        if (userIds.length === 0) return [];

        const pipeline = client.pipeline();
        userIds.forEach((id) => pipeline.get(KEYS.USER + id));
        const results = await pipeline.exec();

        return results
          .filter(([err, data]) => !err && data)
          .map(([, data]) => JSON.parse(data));
      } else {
        const users = [];
        for (const [key, value] of this.localCache.entries()) {
          if (key.startsWith(KEYS.USER)) {
            users.push(value);
          }
        }
        return users;
      }
    } catch (error) {
      logger.error('Error getting all users:', error);
      return [];
    }
  }

  /**
   * Cleanup disconnected users
   * @param {number} maxDisconnectTime - Max disconnect time in ms
   * @returns {Promise<object[]>} Array of removed users
   */
  async cleanupDisconnectedUsers(maxDisconnectTime = 60000) {
    try {
      const users = await this.getAllUsers();
      const now = Date.now();
      const toRemove = users.filter(
        (user) =>
          user.connected === false &&
          user.disconnectedAt &&
          now - user.disconnectedAt > maxDisconnectTime
      );

      for (const user of toRemove) {
        await this.removeUser(user.id);
        logger.info(`Cleaned up disconnected user ${user.id} from room ${user.room}`);
      }

      return toRemove;
    } catch (error) {
      logger.error('Error cleaning up disconnected users:', error);
      return [];
    }
  }

  /**
   * Get storage stats
   * @returns {Promise<object>} Stats object
   */
  async getStats() {
    const client = this.getClient();

    try {
      const rooms = await this.getActiveRooms();
      const users = await this.getAllUsers();

      return {
        totalGames: rooms.length,
        activeRooms: rooms,
        totalUsers: users.length,
        redisEnabled: isRedisEnabled(),
        storageType: client ? 'redis' : 'memory',
      };
    } catch (error) {
      logger.error('Error getting stats:', error);
      return {
        totalGames: 0,
        activeRooms: [],
        totalUsers: 0,
        redisEnabled: isRedisEnabled(),
        storageType: 'unknown',
      };
    }
  }
}

// Export singleton instance
module.exports = new RedisStorageService();
