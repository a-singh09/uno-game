import { Server, Socket } from 'socket.io';
import connectionHandler from './connection';
import lobbyHandler from './lobby';
import gameHandler from './game';
import reconnectionHandler from './reconnection';
import type { GameStateManager } from '../gameStateManager';
import type { UserManager } from '../users';

interface SocketDependencies {
  gameStateManager: GameStateManager;
  userManager: UserManager;
}

function registerSocketHandlers(io: Server, { gameStateManager, userManager }: SocketDependencies): void {
  io.on('connection', (socket: Socket) => {
    connectionHandler(io, socket, { userManager });
    lobbyHandler(io, socket, { userManager });
    gameHandler(io, socket, { gameStateManager, userManager });
    reconnectionHandler(io, socket, { gameStateManager, userManager });
  });
}

export default registerSocketHandlers;
