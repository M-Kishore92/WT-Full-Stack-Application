import { Worker, Job } from "bullmq";
import { prisma } from "../config/prisma";
import { bullRedis } from "../config/redis";
import { reservationExpiryQueue } from "./queues";
import { CacheService } from "../services/cache.service";
import { ReservationStatus } from "@prisma/client";

export class ReservationExpiryService {
  /**
   * Scans and marks all expired ACTIVE reservations as EXPIRED in the database.
   */
  static async expireReservations(): Promise<number> {
    const now = new Date();

    // 1. Find all ACTIVE reservations where expires_at <= now
    const expiredReservations = await prisma.reservation.findMany({
      where: {
        status: ReservationStatus.ACTIVE,
        expires_at: { lte: now },
      },
      select: {
        id: true,
        tier: {
          select: { event_id: true },
        },
      },
    });

    if (expiredReservations.length === 0) {
      return 0;
    }

    const ids = expiredReservations.map((r) => r.id);

    // 2. Bulk update status to EXPIRED
    const updateResult = await prisma.reservation.updateMany({
      where: {
        id: { in: ids },
        status: ReservationStatus.ACTIVE, // Concurrency safeguard
      },
      data: {
        status: ReservationStatus.EXPIRED,
      },
    });

    // 3. Invalidate caches for affected events
    const affectedEventIds = Array.from(
      new Set(expiredReservations.map((r) => r.tier.event_id))
    );

    for (const eventId of affectedEventIds) {
      await CacheService.invalidateEvent(eventId);
    }

    return updateResult.count;
  }
}

export function createReservationExpiryWorker(): Worker {
  const worker = new Worker(
    "reservation-expiry-queue",
    async (job: Job) => {
      const count = await ReservationExpiryService.expireReservations();
      if (count > 0 && process.env.NODE_ENV !== "test") {
        console.log(`[Expiry Worker] Marked ${count} reservations as EXPIRED`);
      }
      return { expiredCount: count };
    },
    {
      connection: bullRedis,
    }
  );

  return worker;
}

export async function scheduleReservationExpiryJob(): Promise<void> {
  // Clear any existing repeatable jobs first
  const repeatableJobs = await reservationExpiryQueue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    await reservationExpiryQueue.removeRepeatableByKey(job.key);
  }

  // Add repeatable job to run every 60 seconds
  await reservationExpiryQueue.add(
    "expire-reservations-cron",
    {},
    {
      repeat: {
        every: 60 * 1000, // 60,000 ms = 60s
      },
      jobId: "reservation-expiry-repeatable",
    }
  );
}
