import { Router, type IRouter } from "express";
import { db, serviceAreasTable } from "@workspace/db";
import { asc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/service-areas", async (_req, res): Promise<void> => {
  const areas = await db.select().from(serviceAreasTable).orderBy(asc(serviceAreasTable.sortOrder));
  res.json(areas);
});

export default router;
