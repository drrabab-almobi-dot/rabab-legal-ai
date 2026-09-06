import { Router, type IRouter } from "express";
import { getPublicServiceModules } from "../lib/service-registry";

const router: IRouter = Router();

/**
 * Public, non-sensitive service manifest for web and mobile.
 * Planned modules are intentionally returned as unavailable; clients must not
 * create a service journey until `available` is true.
 */
router.get("/service-modules", (_req, res): void => {
  res.json(getPublicServiceModules());
});

export default router;
