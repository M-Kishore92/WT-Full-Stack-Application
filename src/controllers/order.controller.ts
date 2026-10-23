import { Request, Response, NextFunction } from "express";
import { OrderService } from "../services/order.service";

export class OrderController {
  static async createOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const { reservationId, idempotencyKey } = req.body;
      const { order, replay } = await OrderService.createOrder(
        req.user.id,
        reservationId,
        idempotencyKey
      );

      res.status(replay ? 200 : 201).json({
        message: replay ? "Order replayed idempotently" : "Order created successfully",
        order,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const { id } = req.params;
      const order = await OrderService.getOrder(id, req.user.id, req.user.role);
      res.status(200).json({ order });
    } catch (error) {
      next(error);
    }
  }
}
