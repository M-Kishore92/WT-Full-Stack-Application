import { Request, Response, NextFunction } from "express";
import { PaymentService } from "../services/payment.service";

export class PaymentController {
  static async charge(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const { orderId, forceOutcome, delayMs } = req.body;
      const result = await PaymentService.chargeOrder(
        req.user.id,
        orderId,
        forceOutcome,
        delayMs
      );

      res.status(202).json(result);
    } catch (error) {
      next(error);
    }
  }

  static async getStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { orderId } = req.params;
      const order = await PaymentService.getPaymentStatus(orderId);
      res.status(200).json({
        order,
        status: order.status,
        tickets: order.tickets,
      });
    } catch (error) {
      next(error);
    }
  }
}
