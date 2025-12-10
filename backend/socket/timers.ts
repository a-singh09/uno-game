import { RECONNECTION_GRACE_MS } from '../constants';

const disconnectTimers = new Map<string, NodeJS.Timeout>(); // userId -> timeout

function scheduleRemoval(userId: string, fn: () => void): void {
  clearRemoval(userId);
  const timer = setTimeout(() => {
    disconnectTimers.delete(userId);
    fn();
  }, RECONNECTION_GRACE_MS);
  disconnectTimers.set(userId, timer);
}

function clearRemoval(userId: string): void {
  const timer = disconnectTimers.get(userId);
  if (timer) {
    clearTimeout(timer);
    disconnectTimers.delete(userId);
  }
}

export { scheduleRemoval, clearRemoval };
