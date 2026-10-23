import { prisma } from "../config/prisma";
import { CacheService } from "./cache.service";
import { Role } from "@prisma/client";

export interface CreateEventInput {
  title: string;
  description?: string;
  venue: string;
  starts_at: string | Date;
  sales_cutoff_at: string | Date;
  tiers?: {
    name: string;
    price: number;
    total_qty: number;
  }[];
}

export interface UpdateEventInput {
  title?: string;
  description?: string;
  venue?: string;
  starts_at?: string | Date;
  sales_cutoff_at?: string | Date;
  status?: "DRAFT" | "PUBLISHED" | "CANCELLED" | "COMPLETED";
}

export class EventService {
  static async listEvents(userRole?: Role, userId?: string) {
    const cacheKey = "cache:events:public";

    // If unauthenticated or attendee, check public cache
    if (!userRole || userRole === Role.ATTENDEE) {
      const cached = await CacheService.get<any[]>(cacheKey);
      if (cached) return cached;
    }

    const whereClause: any = {};
    if (userRole === Role.ORGANIZER && userId) {
      // Return their own events or published events
      whereClause.OR = [
        { organizer_id: userId },
        { status: "PUBLISHED" },
      ];
    } else if (userRole !== Role.ADMIN) {
      whereClause.status = "PUBLISHED";
    }

    const events = await prisma.event.findMany({
      where: whereClause,
      include: {
        organizer: {
          select: { id: true, name: true, email: true },
        },
        tiers: {
          select: {
            id: true,
            name: true,
            price: true,
            total_qty: true,
            sold_qty: true,
          },
        },
      },
      orderBy: { starts_at: "asc" },
    });

    if (!userRole || userRole === Role.ATTENDEE) {
      await CacheService.set(cacheKey, events, 300);
    }

    return events;
  }

  static async getEventById(eventId: string) {
    const cacheKey = `cache:event:${eventId}`;
    const cached = await CacheService.get<any>(cacheKey);
    if (cached) return cached;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        organizer: {
          select: { id: true, name: true, email: true },
        },
        tiers: {
          include: {
            reservations: {
              where: {
                status: "ACTIVE",
                expires_at: { gt: new Date() },
              },
              select: { qty: true },
            },
          },
        },
      },
    });

    if (!event) {
      const error: any = new Error("Event not found");
      error.statusCode = 404;
      throw error;
    }

    // Attach calculated availability for each tier
    const formattedEvent = {
      ...event,
      tiers: event.tiers.map((t) => {
        const activeHeld = t.reservations.reduce((sum, r) => sum + r.qty, 0);
        const available = Math.max(0, t.total_qty - t.sold_qty - activeHeld);
        const { reservations, ...tierData } = t;
        return {
          ...tierData,
          available_qty: available,
          held_qty: activeHeld,
        };
      }),
    };

    await CacheService.set(cacheKey, formattedEvent, 300);
    return formattedEvent;
  }

  static async createEvent(organizerId: string, input: CreateEventInput) {
    const startsAt = new Date(input.starts_at);
    const cutoffAt = new Date(input.sales_cutoff_at);

    if (cutoffAt >= startsAt) {
      const error: any = new Error("Sales cutoff must be strictly before event start time");
      error.statusCode = 400;
      throw error;
    }

    if (input.tiers) {
      for (const tier of input.tiers) {
        if (tier.total_qty <= 0) {
          const error: any = new Error(`Tier quantity must be greater than 0: ${tier.name}`);
          error.statusCode = 400;
          throw error;
        }
        if (tier.price < 0) {
          const error: any = new Error(`Tier price must be >= 0: ${tier.name}`);
          error.statusCode = 400;
          throw error;
        }
      }
    }

    const event = await prisma.event.create({
      data: {
        organizer_id: organizerId,
        title: input.title,
        description: input.description,
        venue: input.venue,
        starts_at: startsAt,
        sales_cutoff_at: cutoffAt,
        status: "PUBLISHED",
        tiers: input.tiers
          ? {
              create: input.tiers.map((t) => ({
                name: t.name,
                price: t.price,
                total_qty: t.total_qty,
                sold_qty: 0,
              })),
            }
          : undefined,
      },
      include: {
        tiers: true,
      },
    });

    await CacheService.invalidateEvent();
    return event;
  }

  static async updateEvent(
    eventId: string,
    userId: string,
    userRole: Role,
    input: UpdateEventInput
  ) {
    const existing = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!existing) {
      const error: any = new Error("Event not found");
      error.statusCode = 404;
      throw error;
    }

    // Multi-tenant check: Organizers can ONLY modify their own events
    if (userRole !== Role.ADMIN && existing.organizer_id !== userId) {
      const error: any = new Error("Forbidden: You do not have permission to modify this event");
      error.statusCode = 403;
      throw error;
    }

    const startsAt = input.starts_at ? new Date(input.starts_at) : existing.starts_at;
    const cutoffAt = input.sales_cutoff_at ? new Date(input.sales_cutoff_at) : existing.sales_cutoff_at;

    if (cutoffAt >= startsAt) {
      const error: any = new Error("Sales cutoff must be strictly before event start time");
      error.statusCode = 400;
      throw error;
    }

    const updated = await prisma.event.update({
      where: { id: eventId },
      data: {
        title: input.title,
        description: input.description,
        venue: input.venue,
        starts_at: input.starts_at ? startsAt : undefined,
        sales_cutoff_at: input.sales_cutoff_at ? cutoffAt : undefined,
        status: input.status,
      },
      include: {
        tiers: true,
      },
    });

    await CacheService.invalidateEvent(eventId);
    return updated;
  }

  static async deleteEvent(eventId: string, userId: string, userRole: Role) {
    const existing = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!existing) {
      const error: any = new Error("Event not found");
      error.statusCode = 404;
      throw error;
    }

    if (userRole !== Role.ADMIN && existing.organizer_id !== userId) {
      const error: any = new Error("Forbidden: You do not have permission to delete this event");
      error.statusCode = 403;
      throw error;
    }

    await prisma.event.delete({
      where: { id: eventId },
    });

    await CacheService.invalidateEvent(eventId);
    return { success: true };
  }

  static async addTier(
    eventId: string,
    userId: string,
    userRole: Role,
    tierData: { name: string; price: number; total_qty: number }
  ) {
    const existing = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!existing) {
      const error: any = new Error("Event not found");
      error.statusCode = 404;
      throw error;
    }

    if (userRole !== Role.ADMIN && existing.organizer_id !== userId) {
      const error: any = new Error("Forbidden: You do not have permission to edit this event");
      error.statusCode = 403;
      throw error;
    }

    if (tierData.total_qty <= 0) {
      const error: any = new Error("Tier total_qty must be greater than 0");
      error.statusCode = 400;
      throw error;
    }

    if (tierData.price < 0) {
      const error: any = new Error("Tier price must be >= 0");
      error.statusCode = 400;
      throw error;
    }

    const tier = await prisma.ticketTier.create({
      data: {
        event_id: eventId,
        name: tierData.name,
        price: tierData.price,
        total_qty: tierData.total_qty,
        sold_qty: 0,
      },
    });

    await CacheService.invalidateEvent(eventId);
    return tier;
  }
}
