/**
 * Socket.io client singleton.
 *
 * Usage:
 *   import { socket, connectSocket, disconnectSocket } from "@/lib/socket";
 *   connectSocket();                          // call once when user is authenticated
 *   socket.on("low-stock", handler);
 *   disconnectSocket();                       // call on logout
 */

import { io, Socket } from "socket.io-client";

export interface LowStockPayload {
  id: number;
  name: string;
  quantity: number;
  reorderLevel: number;
}
import { getAuthToken } from "./auth";

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

export const socket: Socket = io(API_URL, {
  path: "/socket.io",
  autoConnect: false,
  auth: (cb) => cb({ token: getAuthToken() ?? "" }),
});

export function connectSocket(): void {
  if (!socket.connected) {
    socket.connect();
  }
}

export function disconnectSocket(): void {
  socket.disconnect();
}
