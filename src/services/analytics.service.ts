import { prisma } from "../config/prisma";
import { Role } from "@prisma/client";

export class AnalyticsService {
  /**
   * Helper to build event filter based on caller role
   */
  private static getEventWhere(userId: string, role: Role) {
    return role === Role.ADMIN ? {} : { organizer_id: userId };
  }

  /**
   * GET /analytics/revenue?from=&to=
   * Computes daily revenue for organizer's events
   */
  static async getDailyRevenue(
    userId: string,
    role: Role,
    fromStr?: string,
    toStr?: string
  ) {
    const toDate = toStr ? new Date(toStr) : new Date();
    const fromDate = fromStr
      ? new Date(fromStr)
      : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago default

    // Execute raw query for accurate date-trunc grouping in Postgres
    let rawDailyRevenue: any[];

    if (role === Role.ADMIN) {
      rawDailyRevenue = await prisma.$queryRaw`
        SELECT 
          TO_CHAR(o.created_at, 'YYYY-MM-DD') AS date,
          COUNT(o.id)::int AS orders_count,
          COALESCE(SUM(o.total_amount), 0)::numeric(12,2) AS revenue
        FROM "orders" o
        WHERE o.status = 'PAID'
          AND o.created_at >= ${fromDate}
          AND o.created_at <= ${toDate}
        GROUP BY TO_CHAR(o.created_at, 'YYYY-MM-DD')
        ORDER BY date ASC
      `;
    } else {
      rawDailyRevenue = await prisma.$queryRaw`
        SELECT 
          TO_CHAR(o.created_at, 'YYYY-MM-DD') AS date,
          COUNT(o.id)::int AS orders_count,
          COALESCE(SUM(o.total_amount), 0)::numeric(12,2) AS revenue
        FROM "orders" o
        JOIN "reservations" r ON o.reservation_id = r.id
        JOIN "ticket_tiers" tt ON r.tier_id = tt.id
        JOIN "events" e ON tt.event_id = e.id
        WHERE o.status = 'PAID'
          AND e.organizer_id = ${userId}
          AND o.created_at >= ${fromDate}
          AND o.created_at <= ${toDate}
        GROUP BY TO_CHAR(o.created_at, 'YYYY-MM-DD')
        ORDER BY date ASC
      `;
    }

    const totalRevenue = rawDailyRevenue.reduce(
      (sum, row) => sum + Number(row.revenue),
      0
    );
    const totalOrders = rawDailyRevenue.reduce(
      (sum, row) => sum + Number(row.orders_count),
      0
    );

    return {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      summary: {
        totalRevenue: Number(totalRevenue.toFixed(2)),
        totalOrders,
      },
      daily: rawDailyRevenue.map((r) => ({
        date: r.date,
        ordersCount: Number(r.orders_count),
        revenue: Number(r.revenue),
      })),
    };
  }

  /**
   * GET /analytics/tiers
   * Computes tickets sold, remaining, and revenue per tier
   */
  static async getTierSales(userId: string, role: Role) {
    const eventFilter = this.getEventWhere(userId, role);

    const tiers = await prisma.ticketTier.findMany({
      where: {
        event: eventFilter,
      },
      include: {
        event: {
          select: { id: true, title: true, status: true },
        },
      },
      orderBy: { created_at: "desc" },
    });

    const tierStats = tiers.map((t) => {
      const price = Number(t.price);
      const revenue = Number((t.sold_qty * price).toFixed(2));
      const remaining = Math.max(0, t.total_qty - t.sold_qty);

      return {
        tierId: t.id,
        tierName: t.name,
        eventId: t.event_id,
        eventTitle: t.event.title,
        price,
        totalQty: t.total_qty,
        soldQty: t.sold_qty,
        remainingQty: remaining,
        revenue,
        occupancyRate: t.total_qty > 0 ? Number(((t.sold_qty / t.total_qty) * 100).toFixed(1)) : 0,
      };
    });

    return {
      totalTiers: tierStats.length,
      tiers: tierStats,
    };
  }

  /**
   * GET /analytics/conversion
   * Computes paid orders / total reservations ratio
   */
  static async getConversionStats(userId: string, role: Role) {
    const eventFilter = this.getEventWhere(userId, role);

    // Total reservations created for organizer's events
    const reservationsCount = await prisma.reservation.count({
      where: {
        tier: {
          event: eventFilter,
        },
      },
    });

    // Reservations by status
    const activeHolds = await prisma.reservation.count({
      where: {
        status: "ACTIVE",
        tier: { event: eventFilter },
      },
    });

    const convertedHolds = await prisma.reservation.count({
      where: {
        status: "CONVERTED",
        tier: { event: eventFilter },
      },
    });

    const expiredHolds = await prisma.reservation.count({
      where: {
        status: "EXPIRED",
        tier: { event: eventFilter },
      },
    });

    const releasedHolds = await prisma.reservation.count({
      where: {
        status: "RELEASED",
        tier: { event: eventFilter },
      },
    });

    // Orders counts
    const paidOrders = await prisma.order.count({
      where: {
        status: "PAID",
        reservation: {
          tier: { event: eventFilter },
        },
      },
    });

    const pendingOrders = await prisma.order.count({
      where: {
        status: "PENDING",
        reservation: {
          tier: { event: eventFilter },
        },
      },
    });

    const failedOrders = await prisma.order.count({
      where: {
        status: "FAILED",
        reservation: {
          tier: { event: eventFilter },
        },
      },
    });

    const conversionRate =
      reservationsCount > 0
        ? Number(((paidOrders / reservationsCount) * 100).toFixed(2))
        : 0;

    return {
      reservations: {
        total: reservationsCount,
        active: activeHolds,
        converted: convertedHolds,
        expired: expiredHolds,
        released: releasedHolds,
      },
      orders: {
        paid: paidOrders,
        pending: pendingOrders,
        failed: failedOrders,
      },
      conversionRatePercent: conversionRate,
    };
  }
}
