import { Router } from "express";
import { z } from "zod";
import { ReservationController } from "../controllers/reservation.controller";
import { validate } from "../middleware/validate";
import { authenticateJWT } from "../middleware/auth";

const router = Router();

const createReservationSchema = z.object({
  body: z.object({
    tierId: z.string().uuid("Invalid tierId format"),
    qty: z.number().int().positive("Quantity must be a positive integer"),
  }),
});

router.post(
  "/",
  authenticateJWT,
  validate(createReservationSchema),
  ReservationController.createReservation
);

router.get("/:id", authenticateJWT, ReservationController.getReservation);

export default router;
