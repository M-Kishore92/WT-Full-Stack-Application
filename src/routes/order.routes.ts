import { Router } from "express";
import { z } from "zod";
import { OrderController } from "../controllers/order.controller";
import { validate } from "../middleware/validate";
import { authenticateJWT } from "../middleware/auth";

const router = Router();

const createOrderSchema = z.object({
  body: z.object({
    reservationId: z.string().uuid("Invalid reservationId format"),
    idempotencyKey: z.string().min(1, "idempotencyKey is required"),
  }),
});

router.post("/", authenticateJWT, validate(createOrderSchema), OrderController.createOrder);
router.get("/:id", authenticateJWT, OrderController.getOrder);

export default router;
