import { db, activityLogsTable } from "@workspace/db";
export async function logActivity(params) {
    try {
        await db.insert(activityLogsTable).values({
            userId: params.userId ?? null,
            action: params.action,
            module: params.module,
            description: params.description,
            oldData: params.oldData ?? null,
            newData: params.newData ?? null,
        });
    }
    catch {
        // Non-fatal — don't crash the request if logging fails
    }
}
export async function createNotification(params) {
    const { notificationsTable } = await import("@workspace/db");
    try {
        await db.insert(notificationsTable).values({
            userId: params.userId,
            title: params.title,
            message: params.message,
            type: params.type ?? "info",
            link: params.link ?? null,
        });
    }
    catch {
        // Non-fatal
    }
}
