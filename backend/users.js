const logger = require('./logger');
const redisStorage = require('./services/redisStorage');
const { isRedisEnabled } = require('./config/redis');

// In-memory user storage (fallback when Redis is disabled)
const users = []

const addUser = async ({id, name, room, walletAddress = null}) => {
   const usersInRoom = isRedisEnabled() 
      ? await redisStorage.getUsersInRoom(room)
      : users.filter(user => user.room === room && user.connected !== false);
   
   const numberOfUsersInRoom = usersInRoom.length;
   
   if(numberOfUsersInRoom === 6) {
      logger.info(`Room ${room} is full, user ${id} rejected`);
      return { error: 'Room full' };
   }

   // Check if user is reconnecting based on wallet address (preferred) or name
   let existingUser = null;
   
   if (walletAddress) {
      // First, try to find by wallet address in the same room
      existingUser = isRedisEnabled()
         ? await redisStorage.findUserByWalletAndRoom(walletAddress, room)
         : users.find(u => u.walletAddress === walletAddress && u.room === room);
      
      // If found and disconnected, remove the old instance and create fresh user
      if (existingUser && existingUser.connected === false) {
         logger.info(`Found disconnected user with wallet ${walletAddress}, removing old instance`);
         if (isRedisEnabled()) {
            await redisStorage.removeUser(existingUser.id);
         } else {
            const idx = users.findIndex(u => u.id === existingUser.id);
            if (idx !== -1) {
               users.splice(idx, 1);
            }
         }
         // Don't return here - let it create a new user with the new player number
         existingUser = null;
      }
      // If found and still connected, it might be a duplicate connection (same wallet, different tab)
      else if (existingUser && existingUser.connected === true) {
         logger.info(`Found connected user with wallet ${walletAddress}, updating socket ID`);
         // Update the socket ID for the existing user (keep same player name for active connections)
         const updatedUser = {
            ...existingUser,
            id: id,
            connected: true,
            disconnectedAt: null
         };
         
         if (isRedisEnabled()) {
            await redisStorage.removeUser(existingUser.id);
            await redisStorage.saveUser(updatedUser);
         } else {
            const idx = users.findIndex(u => u.id === existingUser.id);
            if (idx !== -1) {
               users[idx] = updatedUser;
            }
         }
         
         logger.info(`User with wallet ${walletAddress} reconnected to room ${room} with new socket ${id}`);
         return { newUser: updatedUser, reconnected: true };
      }
   }
   
   // Fallback: Check if user is reconnecting by name (for backward compatibility)
   if (!existingUser) {
      existingUser = isRedisEnabled()
         ? await redisStorage.findUserByNameAndRoom(name, room)
         : users.find(u => u.name === name && u.room === room && u.connected === false);
      
      if (existingUser && existingUser.connected === false) {
         // User is reconnecting, update their socket ID and wallet address
         const updatedUser = {
            ...existingUser,
            id: id,
            walletAddress: walletAddress || existingUser.walletAddress,
            connected: true,
            disconnectedAt: null
         };
         
         if (isRedisEnabled()) {
            await redisStorage.removeUser(existingUser.id);
            await redisStorage.saveUser(updatedUser);
         } else {
            const idx = users.findIndex(u => u.id === existingUser.id);
            if (idx !== -1) {
               users[idx] = updatedUser;
            }
         }
         
         logger.info(`User ${name} reconnected to room ${room} with new socket ${id}`);
         return { newUser: updatedUser, reconnected: true };
      }
   }

   const newUser = { id, name, room, walletAddress, connected: true, disconnectedAt: null };
   
   if (isRedisEnabled()) {
      await redisStorage.saveUser(newUser);
   } else {
      users.push(newUser);
   }
   
   logger.info(`User ${id} added to room ${room} as ${name} with wallet ${walletAddress || 'none'}`);
   return { newUser };
}

const removeUser = async (id) => {
   if (isRedisEnabled()) {
      const removedUser = await redisStorage.removeUser(id);
      if (removedUser) {
         logger.info(`User ${id} removed from room ${removedUser.room}`);
      } else {
         logger.debug(`Attempted to remove non-existent user ${id}`);
      }
      return removedUser;
   }

   // Fallback to in-memory storage
   const removeIndex = users.findIndex(user => user.id === id);

   if(removeIndex!==-1) {
       const removedUser = users.splice(removeIndex, 1)[0];
       logger.info(`User ${id} removed from room ${removedUser.room}`);
       return removedUser;
   }
   logger.debug(`Attempted to remove non-existent user ${id}`);
   return null;
}

// Mark user as disconnected instead of removing immediately
const markUserDisconnected = async (id) => {
   if (isRedisEnabled()) {
      const updatedUser = await redisStorage.updateUser(id, {
         connected: false,
         disconnectedAt: Date.now()
      });
      if (updatedUser) {
         logger.info(`User ${id} marked as disconnected in room ${updatedUser.room}`);
      }
      return updatedUser;
   }

   // Fallback to in-memory storage
   const user = users.find(user => user.id === id);
   if (user) {
      user.connected = false;
      user.disconnectedAt = Date.now();
      logger.info(`User ${id} marked as disconnected in room ${user.room}`);
      return user;
   }
   return null;
}

// Clean up users who have been disconnected for too long
const cleanupDisconnectedUsers = async (maxDisconnectTime = 60000) => {
   if (isRedisEnabled()) {
      const removed = await redisStorage.cleanupDisconnectedUsers(maxDisconnectTime);
      return removed;
   }

   // Fallback to in-memory storage
   const now = Date.now();
   const toRemove = users.filter(user => 
      user.connected === false && 
      user.disconnectedAt && 
      (now - user.disconnectedAt) > maxDisconnectTime
   );
   
   toRemove.forEach(user => {
      const index = users.findIndex(u => u.id === user.id);
      if (index !== -1) {
         users.splice(index, 1);
         logger.info(`Cleaned up disconnected user ${user.id} from room ${user.room}`);
      }
   });
   
   return toRemove;
}

// Find user by name and room (for reconnection)
const findUserByNameAndRoom = async (name, room) => {
   if (isRedisEnabled()) {
      return redisStorage.findUserByNameAndRoom(name, room);
   }
   return users.find(user => user.name === name && user.room === room);
}

// Find user by wallet address and room (for reconnection)
const findUserByWalletAndRoom = async (walletAddress, room) => {
   if (isRedisEnabled()) {
      return redisStorage.findUserByWalletAndRoom(walletAddress, room);
   }
   return users.find(user => user.walletAddress === walletAddress && user.room === room);
}

const getUser = async (id) => {
   if (isRedisEnabled()) {
      return redisStorage.getUser(id);
   }
   return users.find(user => user.id === id)
}

const getUsersInRoom = async (room) => {
   if (isRedisEnabled()) {
      return redisStorage.getUsersInRoom(room);
   }
   return users.filter(user => user.room === room)
}

module.exports = { 
   addUser, 
   removeUser, 
   getUser, 
   getUsersInRoom, 
   markUserDisconnected, 
   cleanupDisconnectedUsers,
   findUserByNameAndRoom,
   findUserByWalletAndRoom 
}