import { Worker, Job } from "bullmq";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../config/prisma";
import { bullRedis } from "../config/redis";
import { CacheService } from "../services/cache.service";
import { OrderStatus, ReservationStatus, TransactionStatus } from "@prisma/client";

export interface PaymentJobData {
  orderId: string;
  transactionId: string;
  forceOutcome?: "APPROVE" | "REJECT";
  delayMs?: number;
}

export async function processPaymentJob(job: Job<PaymentJobData>) {
  const { orderId, transactionId, forceOutcome, delayMs } = job.data;

  // 1. Mock gateway processing delay: 2-5 seconds (or override for fast automated tests)
  const waitTime =
    delayMs !== undefined
      ? delayMs
      : process.env.NODE_ENV === "test"
      ? 100
      : Math.floor(Math.random() * 3000) + 2000;

  await new Promise((resolve) => setTimeout(resolve, waitTime));

  // 2. Fetch order and transaction
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      reservation: {
        include: {
          tier: true,
        },
      },
    },
  });

  if (!order) {
    throw new Error(`Order ${orderId} not found`);
  }

  // If order was already processed
  if (order.status !== OrderStatus.PENDING) {
    return { status: order.status, message: "Order already finalized" };
  }

  // 3. Determine approval: 70% approve randomly unless forceOutcome specified
  const isApproved =
    forceOutcome === "APPROVE"
      ? true
      : forceOutcome === "REJECT"
      ? false
      : Math.random() < 0.7;

  const eventId = order.reservation.tier.event_id;

  if (isApproved) {
    // APPROVAL FLOW
    const gatewayRef = `gw_appr_${uuidv4().replace(/-/g, "").slice(0, 16)}`;

    await prisma.$transaction(async (tx) => {
      // Mark order as PAID
      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.PAID },
      });

      // Mark reservation as CONVERTED
      await tx.reservation.update({
        where: { id: order.reservation_id },
        data: { status: ReservationStatus.CONVERTED },
      });

      // Increment tier sold_qty
      await tx.ticketTier.update({
        where: { id: order.reservation.tier_id },
        data: {
          sold_qty: {
            increment: order.reservation.qty,
          },
        },
      });

      // Update transaction status to APPROVED
      await tx.transaction.update({
        where: { id: transactionId },
        data: {
          status: TransactionStatus.APPROVED,
          gateway_ref: gatewayRef,
        },
      });

      // Generate unique tickets for the order
      const ticketCreations = [];
      for (let i = 0; i < order.reservation.qty; i++) {
        ticketCreations.push({
          order_id: orderId,
          tier_id: order.reservation.tier_id,
          code: `TKT-${uuidv4().replace(/-/g, "").slice(0, 12).toUpperCase()}`,
        });
      }

      await tx.ticket.createMany({
        data: ticketCreations,
      });
    });

    // Invalidate Redis cache
    await CacheService.invalidateEvent(eventId);

    return {
      success: true,
      outcome: "APPROVED",
      orderId,
      gatewayRef,
    };
  } else {
    // REJECTION FLOW: Order FAILED, reservation RELEASED
    const gatewayRef = `gw_rej_${uuidv4().replace(/-/g, "").slice(0, 16)}`;

    await prisma.$transaction(async (tx) => {
      // Mark order as FAILED
      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.FAILED },
      });

      // Release reservation hold so tickets return to available pool immediately
      await tx.reservation.update({
        where: { id: order.reservation_id },
        data: { status: ReservationStatus.RELEASED },
      });

      // Update transaction status to REJECTED
      await tx.transaction.update({
        where: { id: transactionId },
        data: {
          status: TransactionStatus.REJECTED,
          gateway_ref: gatewayRef,
        },
      });
    });

    // Invalidate Redis cache
    await CacheService.invalidateEvent(eventId);

    return {
      success: false,
      outcome: "REJECTED",
      orderId,
      gatewayRef,
    };
  }
}

export function createPaymentWorker(): Worker<PaymentJobData> {
  const worker = new Worker<PaymentJobData>(
    "payment-queue",
    async (job) => {
      return await processPaymentJob(job);
    },
    {
      connection: bullRedis,
      concurrency: 10,
    }
  );

  worker.on("failed", (job, err) => {
    console.error(`[Payment Worker] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
