import { Router } from "express";
import { AnalyticsController } from "../controllers/analytics.controller";
import { authenticateJWT, requireRole } from "../middleware/auth";
import { Role } from "@prisma/client";

const router = Router();

// Analytics is organizer only (and admin), scoped to their events
router.use(authenticateJWT, requireRole(Role.ORGANIZER, Role.ADMIN));

router.get("/revenue", AnalyticsController.getRevenue);
router.get("/tiers", AnalyticsController.getTiers);
router.get("/conversion", AnalyticsController.getConversion);

export default router;
