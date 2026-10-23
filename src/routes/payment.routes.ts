import { Router } from "express";
import { z } from "zod";
import { PaymentController } from "../controllers/payment.controller";
import { validate } from "../middleware/validate";
import { authenticateJWT } from "../middleware/auth";

const router = Router();

const chargeSchema = z.object({
  body: z.object({
    orderId: z.string().uuid("Invalid orderId format"),
    forceOutcome: z.enum(["APPROVE", "REJECT"]).optional(),
    delayMs: z.number().int().min(0).optional(),
  }),
});

router.post("/charge", authenticateJWT, validate(chargeSchema), PaymentController.charge);
router.get("/status/:orderId", authenticateJWT, PaymentController.getStatus);

export default router;
