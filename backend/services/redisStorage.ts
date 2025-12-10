import { createRedisClient, getRedisEnabled } from '../config/redis';
import logger from '../logger';
import { GAME_STATE_TTL_MS } from '../constants';
import type Redis from 'ioredis';

interface User {
  id: string;
  room?: string;
  [key: string]: any;
}

class RedisStorage {
  private enabled: boolean;
  private client?: Redis;

  constructor() {
    this.enabled = getRedisEnabled();
    if (this.enabled) {
      this.client = createRedisClient('data');
      this.client.connect().catch((err) => {
        logger.error('Redis connect error, disabling Redis: %s', err.message);
        this.enabled = false;
      });
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async set(key: string, value: any, ttlMs?: number): Promise<void> {
    if (!this.enabled || !this.client) return;
    const payload = JSON.stringify(value);
    if (ttlMs) {
      await this.client.set(key, payload, 'PX', ttlMs);
    } else {
      await this.client.set(key, payload);
    }
  }

  async get(key: string): Promise<any> {
    if (!this.enabled || !this.client) return null;
    const res = await this.client.get(key);
    return res ? JSON.parse(res) : null;
  }

  async del(key: string): Promise<void> {
    if (!this.enabled || !this.client) return;
    await this.client.del(key);
  }

  async sadd(key: string, member: string): Promise<void> {
    if (!this.enabled || !this.client) return;
    await this.client.sadd(key, member);
  }

  async srem(key: string, member: string): Promise<void> {
    if (!this.enabled || !this.client) return;
    await this.client.srem(key, member);
  }

  async smembers(key: string): Promise<string[]> {
    if (!this.enabled || !this.client) return [];
    return this.client.smembers(key);
  }

  async saveGameState(roomId: string, state: any): Promise<void> {
    await this.set(`game:state:${roomId}`, state, GAME_STATE_TTL_MS);
  }

  async getGameState(roomId: string): Promise<any> {
    return this.get(`game:state:${roomId}`);
  }

  async deleteGameState(roomId: string): Promise<void> {
    await this.del(`game:state:${roomId}`);
    await this.del(`game:cardhash:${roomId}`);
  }

  async saveCardHashMap(roomId: string, map: any): Promise<void> {
    await this.set(`game:cardhash:${roomId}`, map, GAME_STATE_TTL_MS);
  }

  async getCardHashMap(roomId: string): Promise<any> {
    return this.get(`game:cardhash:${roomId}`);
  }

  async saveUser(user: User): Promise<void> {
    const key = `user:${user.id}`;
    await this.set(key, user, 24 * 60 * 60 * 1000); // 24h
    await this.sadd('users:all', user.id);
    if (user.room) {
      await this.sadd(`room:users:${user.room}`, user.id);
    }
  }

  async removeUser(user: User): Promise<void> {
    const key = `user:${user.id}`;
    await this.del(key);
    await this.srem('users:all', user.id);
    if (user.room) {
      await this.srem(`room:users:${user.room}`, user.id);
    }
  }

  async getUser(socketId: string): Promise<any> {
    return this.get(`user:${socketId}`);
  }

  async getUsersInRoom(room: string): Promise<any[]> {
    const ids = await this.smembers(`room:users:${room}`);
    const users = await Promise.all(
      ids.map(async (id) => ({ id, ...(await this.get(`user:${id}`)) }))
    );
    return users.filter(Boolean);
  }
}

export default RedisStorage;
