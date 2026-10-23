import { prisma } from "../config/prisma";
import { CacheService } from "./cache.service";
import { ReservationStatus } from "@prisma/client";

export class ReservationService {
  static async createReservation(userId: string, tierId: string, qty: number) {
    if (qty <= 0) {
      const error: any = new Error("Reservation quantity must be at least 1");
      error.statusCode = 400;
      throw error;
    }

    // Execute atomic transaction with pessimistic row-level lock (FOR UPDATE)
    const result = await prisma.$transaction(async (tx) => {
      // 1. Lock the ticket tier row exclusively
      const tiers: any[] = await tx.$queryRaw`
        SELECT id, event_id, name, price, total_qty, sold_qty
        FROM "ticket_tiers"
        WHERE id = ${tierId}
        FOR UPDATE
      `;

      if (!tiers || tiers.length === 0) {
        const error: any = new Error("Ticket tier not found");
        error.statusCode = 404;
        throw error;
      }

      const tier = tiers[0];

      // 2. Fetch event to verify sales cutoff
      const event = await tx.event.findUnique({
        where: { id: tier.event_id },
        select: { id: true, title: true, sales_cutoff_at: true, status: true },
      });

      if (!event) {
        const error: any = new Error("Associated event not found");
        error.statusCode = 404;
        throw error;
      }

      // Check if sales cutoff has passed
      const now = new Date();
      if (new Date(event.sales_cutoff_at) <= now) {
        const error: any = new Error("Sales cut-off for this event has already passed");
        error.statusCode = 400;
        throw error;
      }

      // 3. Compute active holds: SUM(qty) of ACTIVE reservations where expires_at > now
      const activeHolds = await tx.reservation.aggregate({
        where: {
          tier_id: tierId,
          status: ReservationStatus.ACTIVE,
          expires_at: { gt: now },
        },
        _sum: {
          qty: true,
        },
      });

      const heldQty = activeHolds._sum.qty || 0;
      const available = tier.total_qty - tier.sold_qty - heldQty;

      // 4. Concurrency check: If available < requested qty, reject with 409
      if (available < qty) {
        const error: any = new Error(
          `Not enough tickets available. Requested: ${qty}, Available: ${Math.max(0, available)}`
        );
        error.statusCode = 409;
        throw error;
      }

      // 5. Create reservation with expires_at = now() + 10 min
      const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);

      const reservation = await tx.reservation.create({
        data: {
          user_id: userId,
          tier_id: tierId,
          qty,
          status: ReservationStatus.ACTIVE,
          expires_at: expiresAt,
        },
        include: {
          tier: {
            select: {
              id: true,
              name: true,
              price: true,
              event: {
                select: {
                  id: true,
                  title: true,
                  venue: true,
                  starts_at: true,
                },
              },
            },
          },
        },
      });

      return { reservation, eventId: tier.event_id };
    });

    // Invalidate Redis event cache so public view updates
    await CacheService.invalidateEvent(result.eventId);

    return result.reservation;
  }

  static async getReservation(reservationId: string, userId?: string, userRole?: string) {
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        tier: {
          include: {
            event: {
              select: { id: true, title: true, organizer_id: true, starts_at: true },
            },
          },
        },
        order: {
          select: { id: true, status: true, total_amount: true, idempotency_key: true },
        },
      },
    });

    if (!reservation) {
      const error: any = new Error("Reservation not found");
      error.statusCode = 404;
      throw error;
    }

    // Role check: Admin can view any; user can view their own; organizer can view for their event
    if (
      userRole !== "ADMIN" &&
      reservation.user_id !== userId &&
      reservation.tier.event.organizer_id !== userId
    ) {
      const error: any = new Error("Forbidden: Cannot view this reservation");
      error.statusCode = 403;
      throw error;
    }

    return reservation;
  }
}
