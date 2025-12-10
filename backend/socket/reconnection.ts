import { Server, Socket } from 'socket.io';
import logger from '../logger';
import { clearRemoval } from './timers';
import type { UserManager } from '../users';
import type { GameStateManager } from '../gameStateManager';

interface ReconnectionDependencies {
  userManager: UserManager;
  gameStateManager: GameStateManager;
}

interface RejoinPayload {
  room: string;
  gameId?: string | number;
  walletAddress?: string;
}

interface RejoinResponse {
  success: boolean;
  error?: string;
  room?: string;
  gameId?: string | number;
}

export default function reconnectionHandler(
  io: Server,
  socket: Socket,
  { userManager }: ReconnectionDependencies
): void {
  socket.on('rejoinRoom', ({ room, gameId, walletAddress }: RejoinPayload, callback?: (response: RejoinResponse) => void) => {
    const match = userManager.reconnectUser({
      room,
      walletAddress,
      newId: socket.id,
    });

    if (!match) {
      callback?.({ success: false, error: 'Room not found' });
      return;
    }

    clearRemoval(match.id);
    socket.join(room);
    logger.info('User reconnected to room %s as %s', room, match.name);

    socket.emit('reconnected', { room, gameId });
    io.to(room).emit('playerReconnected', {
      userId: match.id,
      room,
      timestamp: Date.now(),
    });

    const users = userManager.getUsersInRoom(room);
    io.to(room).emit('roomData', { room, users });

    callback?.({ success: true, room, gameId });
  });
}
