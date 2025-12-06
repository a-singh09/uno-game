const logger = require('../logger');
const { addUser, removeUser, getUser, getUsersInRoom } = require('../users');

/**
 * Register lobby and room-related socket event handlers
 * @param {Socket} socket - Socket.IO socket instance
 * @param {Server} io - Socket.IO server instance
 */
function registerLobbyHandlers(socket, io) {
  /**
   * Join Lobby Handler
   * Handles when a user joins a game lobby/room
   */
  socket.on('join', async (payload, callback) => {
    const { room, walletAddress } = payload;
    
    let usersInRoom = await getUsersInRoom(room);

    // Find the highest player number ever assigned in this room
    // This ensures new players always get a unique number even if previous players left
    let highestPlayerNumber = 0;
    usersInRoom.forEach(user => {
      const match = user.name.match(/Player (\d+)/);
      if (match) {
        const playerNum = parseInt(match[1]);
        if (playerNum > highestPlayerNumber) {
          highestPlayerNumber = playerNum;
        }
      }
    });

    // Assign player name based on highest player number + 1
    const playerName = `Player ${highestPlayerNumber + 1}`;

    const { error, newUser, reconnected } = await addUser({
      id: socket.id,
      name: playerName,
      room: room,
      walletAddress: walletAddress || null,
    });

    if (error) return callback(error);

    socket.join(newUser.room);

    const updatedUsers = await getUsersInRoom(newUser.room);
    io.to(newUser.room).emit('roomData', { room: newUser.room, users: updatedUsers });
    socket.emit('currentUserData', { name: newUser.name });
    
    if (reconnected) {
      logger.info(`User ${socket.id} reconnected to room ${room} as ${newUser.name} with wallet ${walletAddress || 'none'}`);
    } else {
      logger.info(`User ${socket.id} joined room ${room} as ${newUser.name} with wallet ${walletAddress || 'none'}`);
    }
    
    logger.debug(newUser);
    callback();
  });

  /**
   * Quit Room Handler
   * Handles when a user quits a room
   */
  socket.on('quitRoom', async () => {
    const user = await removeUser(socket.id);
    if (user) {
      const usersInRoom = await getUsersInRoom(user.room);
      io.to(user.room).emit('roomData', { room: user.room, users: usersInRoom });
    }
  });

  /**
   * Send Message Handler
   * Handles chat messages in the lobby/room
   */
  socket.on('sendMessage', async (payload, callback) => {
    const user = await getUser(socket.id);
    if (user) {
      io.to(user.room).emit('message', { user: user.name, text: payload.message });
      callback();
    }
  });
}

module.exports = { registerLobbyHandlers };
