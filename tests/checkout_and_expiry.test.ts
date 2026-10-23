import { request, resetAndSeed, generateToken, cleanupTestResources } from "./helpers";
import { prisma } from "../src/config/prisma";
import { redis } from "../src/config/redis";
import { ReservationExpiryService } from "../src/jobs/reservationExpiry.worker";

describe("3. Checkout, Expiry & Idempotency Tests", () => {
  let seeded: any;
  let limitedTierId: string;

  beforeEach(async () => {
    seeded = await resetAndSeed();
    const limitedTier = seeded.event1.tiers.find((t: any) => t.total_qty === 5);
    limitedTierId = limitedTier.id;
  });

  afterAll(async () => {
    await cleanupTestResources();
  });

  it("Expired hold: create hold, force expiry, attempt checkout (410), confirm tickets available again", async () => {
    const token = generateToken(seeded.attendee1);

    // 1. Create a hold for all 5 tickets
    const holdRes = await request
      .post("/reservations")
      .set("Authorization", `Bearer ${token}`)
      .send({
        tierId: limitedTierId,
        qty: 5,
      });

    expect(holdRes.status).toBe(201);
    const reservationId = holdRes.body.reservation.id;

    // Verify 0 tickets currently available
    const checkFullRes = await request
      .post("/reservations")
      .set("Authorization", `Bearer ${token}`)
      .send({
        tierId: limitedTierId,
        qty: 1,
      });
    expect(checkFullRes.status).toBe(409);

    // 2. Force expiry by updating expires_at into the past
    await prisma.reservation.update({
      where: { id: reservationId },
      data: {
        expires_at: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
      },
    });

    // 3. Attempt checkout on expired hold -> Expect 410 Gone
    const checkoutRes = await request
      .post("/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        reservationId,
        idempotencyKey: "test-expired-hold-key",
      });

    expect(checkoutRes.status).toBe(410);
    expect(checkoutRes.body.error).toMatch(/expired/i);

    // 4. Run background expiry worker scanner
    const expiredCount = await ReservationExpiryService.expireReservations();
    expect(expiredCount).toBeGreaterThanOrEqual(1);

    // 5. Confirm the 5 tickets are now available again!
    const rebookRes = await request
      .post("/reservations")
      .set("Authorization", `Bearer ${token}`)
      .send({
        tierId: limitedTierId,
        qty: 5,
      });

    expect(rebookRes.status).toBe(201);
    expect(rebookRes.body.reservation.qty).toBe(5);
  });

  it("Duplicate idempotencyKey does not create a second order", async () => {
    const token = generateToken(seeded.attendee1);

    // 1. Create reservation 1
    const hold1 = await request
      .post("/reservations")
      .set("Authorization", `Bearer ${token}`)
      .send({
        tierId: limitedTierId,
        qty: 2,
      });
    expect(hold1.status).toBe(201);
    const resId1 = hold1.body.reservation.id;

    // 2. Create reservation 2
    const hold2 = await request
      .post("/reservations")
      .set("Authorization", `Bearer ${token}`)
      .send({
        tierId: limitedTierId,
        qty: 2,
      });
    expect(hold2.status).toBe(201);
    const resId2 = hold2.body.reservation.id;

    const idempotencyKey = "unique-order-key-abc-123";

    // 3. First order creation
    const orderRes1 = await request
      .post("/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        reservationId: resId1,
        idempotencyKey,
      });

    expect(orderRes1.status).toBe(201);
    const orderId1 = orderRes1.body.order.id;

    // 4. Duplicate request with identical idempotencyKey & reservation -> Replay (200), same order
    const orderResReplay = await request
      .post("/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        reservationId: resId1,
        idempotencyKey,
      });

    expect(orderResReplay.status).toBe(200);
    expect(orderResReplay.body.order.id).toBe(orderId1);

    // 5. Reusing the SAME idempotencyKey for a DIFFERENT reservation -> Rejected (409)
    const orderResConflict = await request
      .post("/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        reservationId: resId2,
        idempotencyKey,
      });

    expect(orderResConflict.status).toBe(409);
    expect(orderResConflict.body.error).toMatch(/idempotency/i);

    // 6. Verify database: exactly 1 order exists with this idempotency key
    const ordersInDb = await prisma.order.findMany({
      where: { idempotency_key: idempotencyKey },
    });
    expect(ordersInDb.length).toBe(1);
  });
});
