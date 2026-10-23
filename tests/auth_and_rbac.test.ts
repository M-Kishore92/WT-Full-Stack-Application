import { request, resetAndSeed, generateToken, cleanupTestResources } from "./helpers";
import { prisma } from "../src/config/prisma";
import { redis } from "../src/config/redis";

describe("1. Auth & RBAC Tests", () => {
  let seeded: any;

  beforeAll(async () => {
    seeded = await resetAndSeed();
  });

  afterAll(async () => {
    await cleanupTestResources();
  });

  it("should register a new attendee successfully", async () => {
    const res = await request.post("/auth/register").send({
      name: "New Guest",
      email: "newguest@test.com",
      password: "Password123!",
    });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("token");
    expect(res.body.user.email).toBe("newguest@test.com");
    expect(res.body.user.role).toBe("ATTENDEE");
  });

  it("should login registered user and return JWT with role claim", async () => {
    const res = await request.post("/auth/login").send({
      email: "admin@tickets.local",
      password: "Password123!",
    });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("token");
    expect(res.body.user.role).toBe("ADMIN");
  });

  it("should reject login with wrong password", async () => {
    const res = await request.post("/auth/login").send({
      email: "admin@tickets.local",
      password: "WrongPassword!",
    });

    expect(res.status).toBe(401);
  });

  it("Role check: Attendee CANNOT create events (403)", async () => {
    const token = generateToken(seeded.attendee1);
    const startsAt = new Date(Date.now() + 10 * 86400000).toISOString();
    const cutoffAt = new Date(Date.now() + 9 * 86400000).toISOString();

    const res = await request
      .post("/events")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Attendee Event Attempt",
        venue: "Basement",
        starts_at: startsAt,
        sales_cutoff_at: cutoffAt,
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Forbidden/i);
  });

  it("Multi-tenant isolation: Organizer A cannot edit Organizer B's event (403)", async () => {
    // seeded.event2 is owned by organizer2 (Organizer B)
    // We attempt to update it using Organizer 1's token (Organizer A)
    const tokenA = generateToken(seeded.organizer1);

    const res = await request
      .put(`/events/${seeded.event2.id}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        title: "Malicious Takeover Title",
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Forbidden/i);
  });

  it("Multi-tenant isolation: Organizer A CAN edit their own event (200)", async () => {
    const tokenA = generateToken(seeded.organizer1);

    const res = await request
      .put(`/events/${seeded.event1.id}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        title: "Global Tech Summit 2026 - Updated Title",
      });

    expect(res.status).toBe(200);
    expect(res.body.event.title).toBe("Global Tech Summit 2026 - Updated Title");
  }, 15000);

  it("Admin can update any event across tenants (200)", async () => {
    const adminToken = generateToken(seeded.admin);

    const res = await request
      .put(`/events/${seeded.event2.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Indie Beats Festival - Admin Verified",
      });

    expect(res.status).toBe(200);
    expect(res.body.event.title).toBe("Indie Beats Festival - Admin Verified");
  }, 15000);
});
