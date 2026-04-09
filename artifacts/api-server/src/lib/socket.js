/**
 * Socket.io server — real-time event bus for FurniCore ERP.
 *
 * Roles that receive inventory alerts:
 *   admin | manager | inventory_manager
 *
 * Auth: JWT in socket.handshake.auth.token (same secret as REST API).
 */
import { Server } from "socket.io";
import { verifyAccessToken } from "./auth";
import { logger } from "./logger";
let io;
export function initSocket(httpServer) {
    io = new Server(httpServer, {
        cors: { origin: "*", credentials: true },
        path: "/socket.io",
    });
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token)
            return next(new Error("Unauthorized: no token"));
        try {
            const payload = verifyAccessToken(token);
            socket.data.user = payload;
            next();
        }
        catch {
            next(new Error("Unauthorized: invalid token"));
        }
    });
    io.on("connection", (socket) => {
        const user = socket.data.user;
        // Each socket joins a room named after its role — enables targeted broadcasts.
        socket.join(`role:${user.role}`);
        logger.debug({ socketId: socket.id, role: user.role }, "Socket connected");
        socket.on("disconnect", () => {
            logger.debug({ socketId: socket.id }, "Socket disconnected");
        });
    });
    logger.info("Socket.io initialised");
    return io;
}
/** Broadcast a low-stock alert to all admin / manager / inventory_manager sockets. */
export function emitLowStockAlert(item) {
    if (!io)
        return;
    io
        .to("role:admin")
        .to("role:manager")
        .to("role:inventory_manager")
        .emit("low-stock", item);
}
/** Notify owner (admin), sales, production manager (manager), and accountant of a new portal order. */
export function emitNewCustomerOrder(payload) {
    if (!io)
        return;
    io
        .to("role:admin")
        .to("role:manager")
        .to("role:sales_manager")
        .to("role:accountant")
        .emit("new-customer-order", payload);
}
