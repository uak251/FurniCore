import { db, activityLogsTable } from "@workspace/db";

export async function logActivity(params: {
  userId?: number;
  action: string;
  module: string;
  description: string;
  oldData?: unknown;
  newData?: unknown;
}): Promise<void> {
  try {
    await db.insert(activityLogsTable).values({
      userId: params.userId ?? null,
      action: params.action,
      module: params.module,
      description: params.description,
      oldData: params.oldData as Record<string, unknown> ?? null,
      newData: params.newData as Record<string, unknown> ?? null,
    });
  } catch {
    // Non-fatal — don't crash the request if logging fails
  }
}

export async function createNotification(params: {
  userId: number;
  title: string;
  message: string;
  type?: string;
  link?: string;
}): Promise<void> {
  const { notificationsTable } = await import("@workspace/db");
  try {
    await db.insert(notificationsTable).values({
      userId: params.userId,
      title: params.title,
      message: params.message,
      type: params.type ?? "info",
      link: params.link ?? null,
    });
  } catch {
    // Non-fatal
  }
}
