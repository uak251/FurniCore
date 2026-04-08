/**
 * Socket.io client singleton.
 *
 * Usage:
 *   connectSocket() after login; socket.on("low-stock", …)
 *   disconnectSocket() from logout handlers only — do not disconnect when a
 *   component unmounts (e.g. switching portal layouts) or stock alerts stop.
 */

import { io, type Socket } from "socket.io-client";
import { getAuthToken } from "./auth";
import { socketIoOrigin } from "./api-base";

export interface LowStockPayload {
  id: number;
  name: string;
  quantity: number;
  reorderLevel: number;
}

export const socket: Socket = io(socketIoOrigin(), {
  path: "/socket.io",
  autoConnect: false,
  /** Fresh token on each connection / reconnect attempt */
  auth: (cb) => {
    cb({ token: getAuthToken() ?? "" });
  },
});

export function connectSocket(): void {
  if (!socket.connected) {
    socket.connect();
  }
}

export function disconnectSocket(): void {
  socket.disconnect();
}
