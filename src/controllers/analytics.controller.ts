import { Request, Response, NextFunction } from "express";
import { AnalyticsService } from "../services/analytics.service";

export class AnalyticsController {
  static async getRevenue(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const { from, to } = req.query as { from?: string; to?: string };
      const data = await AnalyticsService.getDailyRevenue(
        req.user.id,
        req.user.role,
        from,
        to
      );
      res.status(200).json(data);
    } catch (error) {
      next(error);
    }
  }

  static async getTiers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const data = await AnalyticsService.getTierSales(req.user.id, req.user.role);
      res.status(200).json(data);
    } catch (error) {
      next(error);
    }
  }

  static async getConversion(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const data = await AnalyticsService.getConversionStats(req.user.id, req.user.role);
      res.status(200).json(data);
    } catch (error) {
      next(error);
    }
  }
}
