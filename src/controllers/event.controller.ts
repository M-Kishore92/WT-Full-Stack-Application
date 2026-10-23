import { Request, Response, NextFunction } from "express";
import { EventService } from "../services/event.service";

export class EventController {
  static async listEvents(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const events = await EventService.listEvents(req.user?.role, req.user?.id);
      res.status(200).json({ events });
    } catch (error) {
      next(error);
    }
  }

  static async getEventById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const event = await EventService.getEventById(id);
      res.status(200).json({ event });
    } catch (error) {
      next(error);
    }
  }

  static async createEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const event = await EventService.createEvent(req.user.id, req.body);
      res.status(201).json({ message: "Event created successfully", event });
    } catch (error) {
      next(error);
    }
  }

  static async updateEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const { id } = req.params;
      const event = await EventService.updateEvent(id, req.user.id, req.user.role, req.body);
      res.status(200).json({ message: "Event updated successfully", event });
    } catch (error) {
      next(error);
    }
  }

  static async deleteEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const { id } = req.params;
      const result = await EventService.deleteEvent(id, req.user.id, req.user.role);
      res.status(200).json({ message: "Event deleted successfully", ...result });
    } catch (error) {
      next(error);
    }
  }

  static async addTier(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const { id } = req.params;
      const tier = await EventService.addTier(id, req.user.id, req.user.role, req.body);
      res.status(201).json({ message: "Tier added successfully", tier });
    } catch (error) {
      next(error);
    }
  }
}
