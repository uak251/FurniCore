import { Router } from "express";
import { authenticate } from "../middlewares/authenticate";
import {
  analyticsTestHandler,
  nativeAnalyticsByModuleHandler,
} from "../controllers/analytics.controller";

const router = Router();

router.get("/test", analyticsTestHandler);
router.get("/native/:module", authenticate, nativeAnalyticsByModuleHandler);

export default router;
