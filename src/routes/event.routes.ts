import { Router } from "express";
import { z } from "zod";
import { EventController } from "../controllers/event.controller";
import { validate } from "../middleware/validate";
import { authenticateJWT, requireRole } from "../middleware/auth";
import { Role } from "@prisma/client";

const router = Router();

const createEventSchema = z.object({
  body: z.object({
    title: z.string().min(1, "Title is required"),
    description: z.string().optional(),
    venue: z.string().min(1, "Venue is required"),
    starts_at: z.string().datetime("starts_at must be an ISO 8601 datetime string"),
    sales_cutoff_at: z.string().datetime("sales_cutoff_at must be an ISO 8601 datetime string"),
    tiers: z
      .array(
        z.object({
          name: z.string().min(1, "Tier name is required"),
          price: z.number().min(0, "Price must be >= 0"),
          total_qty: z.number().int().positive("Quantity must be > 0"),
        })
      )
      .optional(),
  }),
});

const updateEventSchema = z.object({
  body: z.object({
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    venue: z.string().min(1).optional(),
    starts_at: z.string().datetime().optional(),
    sales_cutoff_at: z.string().datetime().optional(),
    status: z.enum(["DRAFT", "PUBLISHED", "CANCELLED", "COMPLETED"]).optional(),
  }),
});

const addTierSchema = z.object({
  body: z.object({
    name: z.string().min(1, "Tier name is required"),
    price: z.number().min(0, "Price must be >= 0"),
    total_qty: z.number().int().positive("Quantity must be > 0"),
  }),
});

// Optional auth for public list/get so organizers can see their drafts if logged in
const optionalAuth = (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    authenticateJWT(req, res, next);
  } else {
    next();
  }
};

router.get("/", optionalAuth, EventController.listEvents);
router.get("/:id", EventController.getEventById);

router.post(
  "/",
  authenticateJWT,
  requireRole(Role.ORGANIZER, Role.ADMIN),
  validate(createEventSchema),
  EventController.createEvent
);

router.put(
  "/:id",
  authenticateJWT,
  requireRole(Role.ORGANIZER, Role.ADMIN),
  validate(updateEventSchema),
  EventController.updateEvent
);

router.delete(
  "/:id",
  authenticateJWT,
  requireRole(Role.ORGANIZER, Role.ADMIN),
  EventController.deleteEvent
);

router.post(
  "/:id/tiers",
  authenticateJWT,
  requireRole(Role.ORGANIZER, Role.ADMIN),
  validate(addTierSchema),
  EventController.addTier
);

export default router;
