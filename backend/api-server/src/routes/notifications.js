import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, notificationsTable } from "@workspace/db";
import { ListNotificationsQueryParams, MarkNotificationReadParams } from "@workspace/api-zod";
import { authenticate } from "../middlewares/authenticate";
import { logger } from "../lib/logger";
const router = Router();
router.get("/notifications", authenticate, async (req, res) => {
    try {
        const params = ListNotificationsQueryParams.safeParse(req.query);
        let query = db.select().from(notificationsTable).where(eq(notificationsTable.userId, req.user.id)).$dynamic();
        if (params.success && params.data.unread === true) {
            query = query.where(and(eq(notificationsTable.userId, req.user.id), eq(notificationsTable.isRead, false)));
        }
        const notifications = await query;
        res.json(notifications);
    }
    catch (err) {
        logger.warn({ err: err?.message }, "notifications_list_skipped");
        res.json([]);
    }
});
router.post("/notifications/:id/read", authenticate, async (req, res) => {
    const params = MarkNotificationReadParams.safeParse(req.params);
    if (!params.success) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    const [notification] = await db.update(notificationsTable)
        .set({ isRead: true })
        .where(and(eq(notificationsTable.id, params.data.id), eq(notificationsTable.userId, req.user.id)))
        .returning();
    if (!notification) {
        res.status(404).json({ error: "Notification not found" });
        return;
    }
    res.json(notification);
});
router.post("/notifications/read-all", authenticate, async (req, res) => {
    await db.update(notificationsTable).set({ isRead: true }).where(eq(notificationsTable.userId, req.user.id));
    res.json({ message: "All notifications marked as read" });
});
export default router;
