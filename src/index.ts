import { app } from "./app";
import { config } from "./config";
import { createPaymentWorker } from "./jobs/payment.worker";
import {
  createReservationExpiryWorker,
  scheduleReservationExpiryJob,
} from "./jobs/reservationExpiry.worker";
import { prisma } from "./config/prisma";
import { redis } from "./config/redis";

const server = app.listen(config.port, async () => {
  console.log(`🚀 Server listening on http://localhost:${config.port}`);
  console.log(`📦 Environment: ${config.nodeEnv}`);

  try {
    // Start BullMQ workers
    const paymentWorker = createPaymentWorker();
    const expiryWorker = createReservationExpiryWorker();
    await scheduleReservationExpiryJob();

    console.log("⚡ BullMQ workers active: Payment Worker & Reservation Expiry Worker (every 60s)");

    // Graceful shutdown
    const shutdown = async () => {
      console.log("\n🛑 Gracefully shutting down...");
      server.close(async () => {
        await paymentWorker.close();
        await expiryWorker.close();
        await prisma.$disconnect();
        await redis.quit();
        console.log("👋 Cleanup complete. Server stopped.");
        process.exit(0);
      });
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (err) {
    console.error("Failed to start background workers:", err);
  }
});
