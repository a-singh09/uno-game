import express, { Request, Response } from 'express';
import os from 'os';
import gameStateManager from '../gameStateManager';
import RedisStorage from '../services/redisStorage';

const router = express.Router();

router.get('/health', async (_req: Request, res: Response) => {
  const redis = new RedisStorage();
  const redisEnabled = redis.isEnabled();
  const counts = gameStateManager.counts();

  res.json({
    status: 'ok',
    uptime: process.uptime(),
    gameStates: counts.gameStates,
    activeRooms: counts.activeRooms,
    redisEnabled,
    storageType: redisEnabled ? 'redis' : 'memory',
    memory: process.memoryUsage(),
    loadavg: os.loadavg(),
  });
});

export default router;
