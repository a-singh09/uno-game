import { Server, Socket } from 'socket.io';
import type { UserManager } from '../users';
interface ConnectionDependencies {
    userManager: UserManager;
}
export default function connectionHandler(io: Server, socket: Socket, { userManager }: ConnectionDependencies): void;
export {};
//# sourceMappingURL=connection.d.ts.map