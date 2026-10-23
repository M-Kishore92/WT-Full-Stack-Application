import { Queue } from "bullmq";
import { bullRedis } from "../config/redis";

export const paymentQueue = new Queue("payment-queue", {
  connection: bullRedis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: 100,
    removeOnFail: 100,
  },
});

export const reservationExpiryQueue = new Queue("reservation-expiry-queue", {
  connection: bullRedis,
  defaultJobOptions: {
    removeOnComplete: 20,
    removeOnFail: 20,
  },
});

export async function closeQueues(): Promise<void> {
  try {
    await paymentQueue.close();
    await reservationExpiryQueue.close();
  } catch (err) {
    // Ignore close errors during tests
  }
}

