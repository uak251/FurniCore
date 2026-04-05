import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, activityLogsTable, usersTable } from "@workspace/db";
import { ListActivityLogsQueryParams } from "@workspace/api-zod";
import { authenticate } from "../middlewares/authenticate";

const router: IRouter = Router();

router.get("/activity-logs", authenticate, async (req, res): Promise<void> => {
  const params = ListActivityLogsQueryParams.safeParse(req.query);
  const limit = (params.success && params.data.limit) ? Number(params.data.limit) : 50;

  let query = db.select({
    id: activityLogsTable.id,
    userId: activityLogsTable.userId,
    action: activityLogsTable.action,
    module: activityLogsTable.module,
    description: activityLogsTable.description,
    oldData: activityLogsTable.oldData,
    newData: activityLogsTable.newData,
    createdAt: activityLogsTable.createdAt,
    userName: usersTable.name,
  })
  .from(activityLogsTable)
  .leftJoin(usersTable, eq(activityLogsTable.userId, usersTable.id))
  .orderBy(desc(activityLogsTable.createdAt))
  .limit(limit)
  .$dynamic();

  if (params.success && params.data.module) {
    query = query.where(eq(activityLogsTable.module, params.data.module));
  }

  const logs = await query;
  res.json(logs);
});

export default router;
