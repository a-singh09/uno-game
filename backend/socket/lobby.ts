import { Server, Socket } from 'socket.io';
import { clearRemoval } from './timers';
import logger from '../logger';
import type { UserManager } from '../users';

interface LobbyDependencies {
  userManager: UserManager;
}

interface JoinPayload {
  room: string;
  walletAddress?: string;
}

interface SendMessagePayload {
  message: string;
}

export default function lobbyHandler(
  io: Server,
  socket: Socket,
  { userManager }: LobbyDependencies
): void {
  socket.on('join', ({ room, walletAddress }: JoinPayload, callback?: (error: string | null, data?: any) => void) => {
    const result = userManager.addOrReuseUser({ id: socket.id, room, walletAddress });

    if (result.error) {
      callback?.(result.error);
      return;
    }

    const { user, reused } = result;
    if (!user) return;
    
    clearRemoval(user.id);
    socket.join(room);
    logger.info('User %s joined room %s', user.name, room);

    // Emit data to joining user
    socket.emit('currentUserData', { name: user.name });

    // Emit room data to all
    const users = userManager.getUsersInRoom(room);
    io.to(room).emit('roomData', { room, users });

    callback?.(null, { reused });
  });

  socket.on('quitRoom', () => {
    const user = userManager.removeUser(socket.id);
    if (user) {
      socket.leave(user.room);
      const users = userManager.getUsersInRoom(user.room);
      io.to(user.room).emit('roomData', { room: user.room, users });
    }
  });

  socket.on('sendMessage', ({ message }: SendMessagePayload, callback?: () => void) => {
    const user = userManager.getUser(socket.id);
    if (!user) return;
    io.to(user.room).emit('message', { user: user.name, text: message });
    callback?.();
  });
}
