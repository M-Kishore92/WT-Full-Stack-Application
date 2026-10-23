import { request, resetAndSeed, generateToken, cleanupTestResources } from "./helpers";
import { prisma } from "../src/config/prisma";
import { redis } from "../src/config/redis";
import { Role } from "@prisma/client";

describe("2. Reservation Engine & Concurrency Tests", () => {
  let seeded: any;
  let limitedTierId: string;
  let cutoffPassedTierId: string;

  beforeAll(async () => {
    seeded = await resetAndSeed();
    const limitedTier = seeded.event1.tiers.find((t: any) => t.total_qty === 5);
    limitedTierId = limitedTier.id;

    const cutoffTier = seeded.event3.tiers[0];
    cutoffPassedTierId = cutoffTier.id;
  });

  afterAll(async () => {
    await cleanupTestResources();
  });

  it("Booking after the sales cut-off is rejected with 400", async () => {
    const token = generateToken(seeded.attendee1);

    const res = await request
      .post("/reservations")
      .set("Authorization", `Bearer ${token}`)
      .send({
        tierId: cutoffPassedTierId,
        qty: 1,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/sales cut-off/i);
  });

  it("Concurrency test: 50 parallel POST /reservations for a tier with only 5 tickets", async () => {
    // Generate tokens for concurrency pool
    const tokens = Array.from({ length: 50 }, (_, i) =>
      generateToken({
        id: seeded.attendee1.id,
        email: `concurrency_user_${i}@guest.local`,
        role: Role.ATTENDEE,
        name: `Concurrent User ${i}`,
      })
    );

    // Launch 50 simultaneous parallel POST /reservations requests for 1 ticket each
    const requests = tokens.map((token) =>
      request
        .post("/reservations")
        .set("Authorization", `Bearer ${token}`)
        .send({
          tierId: limitedTierId,
          qty: 1,
        })
    );

    const responses = await Promise.all(requests);

    const successfulHolds = responses.filter((r) => r.status === 201);
    const rejectedHolds = responses.filter((r) => r.status === 409);

    console.log(`[Concurrency Test Result]:`);
    console.log(`  - Total Parallel Requests: ${responses.length}`);
    console.log(`  - Successful (201 Created): ${successfulHolds.length}`);
    console.log(`  - Rejected (409 Conflict): ${rejectedHolds.length}`);

    // EXACT ASSERTIONS:
    // Exactly 5 tickets must be held in total
    expect(successfulHolds.length).toBe(5);
    // The rest (45) must be rejected with 409 Conflict
    expect(rejectedHolds.length).toBe(45);

    // Verify DB state: total ACTIVE reserved tickets for this tier MUST be exactly 5
    const activeHolds = await prisma.reservation.findMany({
      where: {
        tier_id: limitedTierId,
        status: "ACTIVE",
      },
    });

    const totalHeldQty = activeHolds.reduce((sum, h) => sum + h.qty, 0);
    expect(totalHeldQty).toBe(5);
    expect(activeHolds.length).toBe(5);

    // A subsequent 51st attempt must also immediately get 409
    const subsequentAttempt = await request
      .post("/reservations")
      .set("Authorization", `Bearer ${tokens[0]}`)
      .send({
        tierId: limitedTierId,
        qty: 1,
      });
    expect(subsequentAttempt.status).toBe(409);
  }, 90000);
});
