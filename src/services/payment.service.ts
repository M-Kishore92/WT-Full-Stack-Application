import { prisma } from "../config/prisma";
import { paymentQueue } from "../jobs/queues";
import { OrderStatus, TransactionStatus } from "@prisma/client";

export class PaymentService {
  static async chargeOrder(
    userId: string,
    orderId: string,
    forceOutcome?: "APPROVE" | "REJECT",
    delayMs?: number
  ) {
    // 1. Fetch order
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        reservation: true,
        transactions: true,
      },
    });

    if (!order) {
      const error: any = new Error("Order not found");
      error.statusCode = 404;
      throw error;
    }

    if (order.user_id !== userId) {
      const error: any = new Error("Forbidden: Order belongs to another user");
      error.statusCode = 403;
      throw error;
    }

    if (order.status === OrderStatus.PAID) {
      return {
        alreadyPaid: true,
        orderId,
        status: OrderStatus.PAID,
        message: "Order has already been paid",
      };
    }

    if (order.status === OrderStatus.FAILED) {
      const error: any = new Error("Order has already failed and cannot be charged");
      error.statusCode = 400;
      throw error;
    }

    // Check if an INITIATED transaction is already active to prevent duplicate charges
    const existingActiveTx = order.transactions.find(
      (t) => t.status === TransactionStatus.INITIATED
    );

    if (existingActiveTx) {
      return {
        alreadyProcessing: true,
        orderId,
        transactionId: existingActiveTx.id,
        status: "PROCESSING",
        message: "Payment charge is already in progress for this order",
      };
    }

    // 2. Create INITIATED Transaction
    const transaction = await prisma.transaction.create({
      data: {
        order_id: orderId,
        amount: order.total_amount,
        status: TransactionStatus.INITIATED,
      },
    });

    // 3. Dispatch to BullMQ payment queue
    await paymentQueue.add(
      "process-payment",
      {
        orderId,
        transactionId: transaction.id,
        forceOutcome,
        delayMs,
      },
      {
        jobId: `payment-${orderId}-${transaction.id}`,
      }
    );

    return {
      orderId,
      transactionId: transaction.id,
      status: "PROCESSING",
      message: "Payment processing initiated",
    };
  }

  static async getPaymentStatus(orderId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        transactions: { orderBy: { created_at: "desc" } },
        tickets: true,
        reservation: {
          select: { id: true, status: true, qty: true, expires_at: true },
        },
      },
    });

    if (!order) {
      const error: any = new Error("Order not found");
      error.statusCode = 404;
      throw error;
    }

    return order;
  }
}
