/* Main server entry for Zunno backend */
import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';

import { socketConfig } from './config/socket';
import registerSocketHandlers from './socket';
import apiRouter from './routes/api';
import logger from './logger';
import gameStateManager from './gameStateManager';
import userManager from './users';
import { setupCleanup } from './utils/cleanup';

const PORT = process.env.PORT || 4000;
const app = express();

app.use(cors());
app.use(express.json());

app.use('/api', apiRouter);

const server = http.createServer(app);

const io = new Server(server, socketConfig);
registerSocketHandlers(io, { gameStateManager, userManager });

// Apply server-level timeouts
server.timeout = 120000; // 120 seconds

setupCleanup({ gameStateManager, userManager });

server.listen(PORT, () => {
  logger.info(`Zunno backend listening on port ${PORT}`);
});

export default server;
