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
    let usersInRoom = await getUsersInRoom(payload.room);
    let numberOfUsersInRoom = usersInRoom.length;

    // Assign player name based on current number of users (Player 1-6)
    const playerName = `Player ${numberOfUsersInRoom + 1}`;

    const { error, newUser } = await addUser({
      id: socket.id,
      name: playerName,
      room: payload.room,
    });

    if (error) return callback(error);

    socket.join(newUser.room);

    const updatedUsers = await getUsersInRoom(newUser.room);
    io.to(newUser.room).emit('roomData', { room: newUser.room, users: updatedUsers });
    socket.emit('currentUserData', { name: newUser.name });
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
