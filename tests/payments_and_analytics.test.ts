import { request, resetAndSeed, generateToken, cleanupTestResources } from "./helpers";
import { prisma } from "../src/config/prisma";
import { Worker } from "bullmq";
import { processPaymentJob } from "../src/jobs/payment.worker";
import { config } from "../src/config";
import Redis from "ioredis";

// Dedicated Redis connection for the test worker — completely isolated
// from the shared bullRedis so other suites' cleanup doesn't affect us
let workerRedis: Redis;
let worker: Worker;

describe("4. Payments, Background Processing & Analytics Tests", () => {
  let seeded: any;
  let limitedTierId: string;

  beforeAll(async () => {
    // Create a fresh, isolated Redis connection for the BullMQ worker
    workerRedis = new Redis(config.redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    // Start in-process worker with dedicated connection
    worker = new Worker(
      "payment-queue",
      async (job) => processPaymentJob(job),
      {
        connection: workerRedis,
        concurrency: 5,
      }
    );

    worker.on("failed", (job, err) => {
      console.error(`[Test Payment Worker] Job ${job?.id} failed:`, err.message);
    });
  });

  beforeEach(async () => {
    seeded = await resetAndSeed();
    const limitedTier = seeded.event1.tiers.find((t: any) => t.total_qty === 5);
    limitedTierId = limitedTier.id;
  });

  afterAll(async () => {
    if (worker) await worker.close();
    try { await workerRedis.quit(); } catch (_) {}
    await cleanupTestResources();
  });

  /** Poll until order leaves PENDING, up to maxAttempts × intervalMs */
  async function pollOrderStatus(
    orderId: string,
    token: string,
    maxAttempts = 50,
    intervalMs = 300
  ): Promise<any> {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, intervalMs));
      const statusRes = await request
        .get(`/payments/status/${orderId}`)
        .set("Authorization", `Bearer ${token}`);
      if (statusRes.body?.order?.status !== "PENDING") {
        return statusRes.body.order;
      }
    }
    return null; // Timed out
  }

  it(
    "Payment approval: order PAID, reservation CONVERTED, sold_qty incremented, tickets issued",
    async () => {
      const token = generateToken(seeded.attendee1);

      // 1. Reserve 2 tickets
      const holdRes = await request
        .post("/reservations")
        .set("Authorization", `Bearer ${token}`)
        .send({ tierId: limitedTierId, qty: 2 });
      expect(holdRes.status).toBe(201);
      const reservationId = holdRes.body.reservation.id;

      // 2. Checkout order
      const orderRes = await request
        .post("/orders")
        .set("Authorization", `Bearer ${token}`)
        .send({
          reservationId,
          idempotencyKey: "pay-approve-test-key-1",
        });
      expect(orderRes.status).toBe(201);
      const orderId = orderRes.body.order.id;

      // 3. Trigger charge with forced APPROVE (delayMs: 0 for instant processing)
      const chargeRes = await request
        .post("/payments/charge")
        .set("Authorization", `Bearer ${token}`)
        .send({
          orderId,
          forceOutcome: "APPROVE",
          delayMs: 0,
        });

      expect(chargeRes.status).toBe(202);
      expect(chargeRes.body.status).toBe("PROCESSING");

      // 4. Poll until worker completes the payment job (up to 15s)
      const finalOrder = await pollOrderStatus(orderId, token);

      expect(finalOrder).toBeDefined();
      expect(finalOrder.status).toBe("PAID");
      expect(finalOrder.reservation.status).toBe("CONVERTED");
      expect(finalOrder.tickets.length).toBe(2);

      // 5. Verify tier sold_qty in database
      const tierInDb = await prisma.ticketTier.findUnique({
        where: { id: limitedTierId },
      });
      expect(tierInDb?.sold_qty).toBe(2);
    },
    60000
  );

  it(
    "Payment rejection releases the hold so tickets are available again",
    async () => {
      const token = generateToken(seeded.attendee2);

      // 1. Reserve all 5 tickets
      const holdRes = await request
        .post("/reservations")
        .set("Authorization", `Bearer ${token}`)
        .send({ tierId: limitedTierId, qty: 5 });
      expect(holdRes.status).toBe(201);
      const reservationId = holdRes.body.reservation.id;

      // Confirm 0 tickets available right now
      const fullCheck = await request
        .post("/reservations")
        .set("Authorization", `Bearer ${token}`)
        .send({ tierId: limitedTierId, qty: 1 });
      expect(fullCheck.status).toBe(409);

      // 2. Checkout order
      const orderRes = await request
        .post("/orders")
        .set("Authorization", `Bearer ${token}`)
        .send({
          reservationId,
          idempotencyKey: "pay-reject-test-key-2",
        });
      expect(orderRes.status).toBe(201);
      const orderId = orderRes.body.order.id;

      // 3. Trigger charge with forced REJECT
      const chargeRes = await request
        .post("/payments/charge")
        .set("Authorization", `Bearer ${token}`)
        .send({
          orderId,
          forceOutcome: "REJECT",
          delayMs: 0,
        });

      expect(chargeRes.status).toBe(202);

      // 4. Poll until worker completes the rejection (up to 15s)
      const finalOrder = await pollOrderStatus(orderId, token);

      expect(finalOrder).toBeDefined();
      expect(finalOrder.status).toBe("FAILED");
      expect(finalOrder.reservation.status).toBe("RELEASED");

      // 5. Verify that hold was RELEASED and the 5 tickets are available again
      const rebookRes = await request
        .post("/reservations")
        .set("Authorization", `Bearer ${token}`)
        .send({ tierId: limitedTierId, qty: 5 });

      expect(rebookRes.status).toBe(201);
      expect(rebookRes.body.reservation.qty).toBe(5);
    },
    60000
  );

  it("Analytics: Organizer can query revenue, tier sales, and conversion rate", async () => {
    const orgToken = generateToken(seeded.organizer1);
    const attendeeToken = generateToken(seeded.attendee1);

    // Attendee is forbidden from viewing organizer analytics
    const attendeeRes = await request
      .get("/analytics/revenue")
      .set("Authorization", `Bearer ${attendeeToken}`);
    expect(attendeeRes.status).toBe(403);

    // Organizer 1 queries revenue
    const revRes = await request
      .get("/analytics/revenue")
      .set("Authorization", `Bearer ${orgToken}`);
    expect(revRes.status).toBe(200);
    expect(revRes.body).toHaveProperty("daily");
    expect(revRes.body).toHaveProperty("summary");

    // Organizer 1 queries tiers
    const tiersRes = await request
      .get("/analytics/tiers")
      .set("Authorization", `Bearer ${orgToken}`);
    expect(tiersRes.status).toBe(200);
    expect(tiersRes.body).toHaveProperty("tiers");
    expect(Array.isArray(tiersRes.body.tiers)).toBe(true);

    // Organizer 1 queries conversion
    const convRes = await request
      .get("/analytics/conversion")
      .set("Authorization", `Bearer ${orgToken}`);
    expect(convRes.status).toBe(200);
    expect(convRes.body).toHaveProperty("conversionRatePercent");
    expect(convRes.body).toHaveProperty("reservations");
    expect(convRes.body).toHaveProperty("orders");
  });
});
