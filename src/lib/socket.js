/**
 * Socket.io client singleton.
 *
 * Usage:
 *   connectSocket() after login; socket.on("low-stock", …)
 *   disconnectSocket() from logout handlers only — do not disconnect when a
 *   component unmounts (e.g. switching portal layouts) or stock alerts stop.
 */
import { io } from "socket.io-client";
import { getAuthToken } from "./auth";
import { socketIoOrigin } from "./api-base";
export const socket = io(socketIoOrigin(), {
    path: "/socket.io",
    autoConnect: false,
    /** Fresh token on each connection / reconnect attempt */
    auth: (cb) => {
        cb({ token: getAuthToken() ?? "" });
    },
});
export function connectSocket() {
    if (!socket.connected) {
        socket.connect();
    }
}
export function disconnectSocket() {
    socket.disconnect();
}
