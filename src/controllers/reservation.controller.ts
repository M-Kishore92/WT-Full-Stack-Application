import { Request, Response, NextFunction } from "express";
import { ReservationService } from "../services/reservation.service";

export class ReservationController {
  static async createReservation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const { tierId, qty } = req.body;
      const reservation = await ReservationService.createReservation(req.user.id, tierId, qty);
      res.status(201).json({
        message: "Reservation created successfully",
        reservation,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getReservation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const { id } = req.params;
      const reservation = await ReservationService.getReservation(id, req.user.id, req.user.role);
      res.status(200).json({ reservation });
    } catch (error) {
      next(error);
    }
  }
}
