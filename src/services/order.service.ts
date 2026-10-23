import { prisma } from "../config/prisma";
import { OrderStatus, ReservationStatus } from "@prisma/client";

export class OrderService {
  static async createOrder(userId: string, reservationId: string, idempotencyKey: string) {
    // 1. Idempotency Check: if order already exists with this idempotencyKey
    const existingKeyOrder = await prisma.order.findUnique({
      where: { idempotency_key: idempotencyKey },
      include: {
        reservation: { include: { tier: true } },
        tickets: true,
      },
    });

    if (existingKeyOrder) {
      if (existingKeyOrder.reservation_id === reservationId) {
        // Idempotent replay: return existing order
        return { order: existingKeyOrder, replay: true };
      }
      const error: any = new Error(
        "Idempotency key already used for a different reservation"
      );
      error.statusCode = 409;
      throw error;
    }

    // 2. Check if reservation already has an order
    const existingResOrder = await prisma.order.findUnique({
      where: { reservation_id: reservationId },
    });

    if (existingResOrder) {
      const error: any = new Error("An order has already been created for this reservation");
      error.statusCode = 409;
      throw error;
    }

    // 3. Verify reservation is ACTIVE and UNEXPIRED (else 410)
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { tier: true },
    });

    if (!reservation) {
      const error: any = new Error("Reservation not found");
      error.statusCode = 404;
      throw error;
    }

    if (reservation.user_id !== userId) {
      const error: any = new Error("Forbidden: This reservation belongs to another user");
      error.statusCode = 403;
      throw error;
    }

    const now = new Date();
    if (reservation.status !== ReservationStatus.ACTIVE || reservation.expires_at <= now) {
      const error: any = new Error("Reservation has expired or is no longer active");
      error.statusCode = 410;
      throw error;
    }

    // 4. Calculate total amount
    const totalAmount = Number(reservation.tier.price) * reservation.qty;

    // 5. Create PENDING order
    const order = await prisma.order.create({
      data: {
        user_id: userId,
        reservation_id: reservationId,
        total_amount: totalAmount,
        status: OrderStatus.PENDING,
        idempotency_key: idempotencyKey,
      },
      include: {
        reservation: {
          include: {
            tier: {
              include: {
                event: {
                  select: { id: true, title: true, starts_at: true },
                },
              },
            },
          },
        },
      },
    });

    return { order, replay: false };
  }

  static async getOrder(orderId: string, userId?: string, userRole?: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        reservation: {
          include: {
            tier: {
              include: {
                event: {
                  select: { id: true, title: true, organizer_id: true },
                },
              },
            },
          },
        },
        transactions: true,
        tickets: true,
      },
    });

    if (!order) {
      const error: any = new Error("Order not found");
      error.statusCode = 404;
      throw error;
    }

    if (
      userRole !== "ADMIN" &&
      order.user_id !== userId &&
      order.reservation.tier.event.organizer_id !== userId
    ) {
      const error: any = new Error("Forbidden: Cannot view this order");
      error.statusCode = 403;
      throw error;
    }

    return order;
  }
}
