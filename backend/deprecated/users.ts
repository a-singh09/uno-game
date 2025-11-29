import logger from "../logger.js";

export interface User {
  id: string;
  name: string;
  room: string;
  walletAddress: string;
  connected: boolean;
  disconnectedAt: number | null;
}

interface AddUserParams {
  id: string;
  name: string;
  room: string;
  walletAddress: string;
}

interface AddUserResult {
  newUser?: User;
  error?: string;
  reconnected?: boolean;
}

const users: User[] = [];

const addUser = ({ id, name, room, walletAddress }: AddUserParams): AddUserResult => {
  // Count currently connected users in the target room
  const numberOfUsersInRoom = users.filter(
    (user) => user.room === room && user.connected !== false
  ).length;

  // Enforce room capacity limit
  if (numberOfUsersInRoom === 6) {
    logger.info(`Room ${room} is full, user ${id} rejected`);
    return { error: "Room full" };
  }

  // Check if user is reconnecting (same name in same room OR same walletAddress in same room)
  let existingUser = users.find(
    (u) => u.name === name && u.room === room && u.connected === false
  );

  // If not found by name, try by walletAddress (for page refresh scenarios)
  if (!existingUser && walletAddress) {
    existingUser = users.find(
      (u) => u.walletAddress === walletAddress && u.room === room && u.connected === false
    );
  }

  if (existingUser) {
    // User is reconnecting, update their socket ID
    existingUser.id = id;
    existingUser.connected = true;
    existingUser.disconnectedAt = null;
    if (walletAddress && !existingUser.walletAddress) {
      existingUser.walletAddress = walletAddress;
    }
    logger.info(
      `User ${name} reconnected to room ${room} with new socket ${id}`
    );
    return { newUser: existingUser, reconnected: true };
  }

  // New user - create and add to users array
  const newUser: User = {
    id,
    name,
    room,
    walletAddress,
    connected: true,
    disconnectedAt: null,
  };
  users.push(newUser);
  logger.info(
    `User ${id} added to room ${room} as ${name} with walletAddress ${walletAddress}`
  );
  return { newUser };
};

const removeUser = (id: string): User | null => {
  const removeIndex = users.findIndex((user) => user.id === id);

  if (removeIndex !== -1) {
    const removedUser = users.splice(removeIndex, 1)[0];
    logger.info(`User ${id} removed from room ${removedUser.room}`);
    return removedUser;
  }
  logger.debug(`Attempted to remove non-existent user ${id}`);
  return null;
};

const markUserDisconnected = (id: string): User | null => {
  const user = users.find((user) => user.id === id);
  if (user) {
    user.connected = false;
    user.disconnectedAt = Date.now();
    logger.info(`User ${id} marked as disconnected in room ${user.room}`);
    return user;
  }
  return null;
};

const cleanupDisconnectedUsers = (
  maxDisconnectTime: number = 60000
): User[] => {
  const now = Date.now();
  const toRemove = users.filter(
    (user) =>
      user.connected === false &&
      user.disconnectedAt &&
      now - user.disconnectedAt > maxDisconnectTime
  );

  toRemove.forEach((user) => {
    const index = users.findIndex((u) => u.id === user.id);
    if (index !== -1) {
      users.splice(index, 1);
      logger.info(
        `Cleaned up disconnected user ${user.id} from room ${user.room}`
      );
    }
  });

  return toRemove;
};

const findUserByNameAndRoom = (
  name: string,
  room: string
): User | undefined => {
  return users.find((user) => user.name === name && user.room === room);
};

const findUserByWalletAddressAndRoom = (
  walletAddress: string,
  room: string
): User | undefined | null => {
  if (!walletAddress) return null;
  return users.find((user) => user.walletAddress === walletAddress && user.room === room);
};

const getUser = (id: string): User | undefined => {
  return users.find((user) => user.id === id);
};

const getUsersInRoom = (room: string): User[] => {
  return users.filter((user) => user.room === room);
};

export {
  addUser,
  removeUser,
  getUser,
  getUsersInRoom,
  markUserDisconnected,
  cleanupDisconnectedUsers,
  findUserByNameAndRoom,
  findUserByWalletAddressAndRoom,
};
