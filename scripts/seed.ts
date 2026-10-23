import bcrypt from "bcryptjs";
import { prisma } from "../src/config/prisma";
import { Role } from "@prisma/client";

export async function seed() {
  console.log("🌱 Seeding database...");

  // Clean existing data in reverse relational order
  await prisma.ticket.deleteMany({});
  await prisma.transaction.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.reservation.deleteMany({});
  await prisma.ticketTier.deleteMany({});
  await prisma.event.deleteMany({});
  await prisma.user.deleteMany({});

  const defaultPasswordHash = await bcrypt.hash("Password123!", 10);

  // 1 Admin
  const admin = await prisma.user.create({
    data: {
      name: "Global Admin",
      email: "admin@tickets.local",
      password_hash: defaultPasswordHash,
      role: Role.ADMIN,
    },
  });

  // 2 Organizers
  const organizer1 = await prisma.user.create({
    data: {
      name: "Apex Events (Org 1)",
      email: "organizer1@fest.local",
      password_hash: defaultPasswordHash,
      role: Role.ORGANIZER,
    },
  });

  const organizer2 = await prisma.user.create({
    data: {
      name: "Summit Group (Org 2)",
      email: "organizer2@summit.local",
      password_hash: defaultPasswordHash,
      role: Role.ORGANIZER,
    },
  });

  // 3 Attendees
  const attendee1 = await prisma.user.create({
    data: {
      name: "Alice Walker",
      email: "attendee1@guest.local",
      password_hash: defaultPasswordHash,
      role: Role.ATTENDEE,
    },
  });

  const attendee2 = await prisma.user.create({
    data: {
      name: "Bob Stone",
      email: "attendee2@guest.local",
      password_hash: defaultPasswordHash,
      role: Role.ATTENDEE,
    },
  });

  const attendee3 = await prisma.user.create({
    data: {
      name: "Charlie Davis",
      email: "attendee3@guest.local",
      password_hash: defaultPasswordHash,
      role: Role.ATTENDEE,
    },
  });

  const now = new Date();

  // Event 1 (Organizer 1)
  const event1Starts = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const event1Cutoff = new Date(now.getTime() + 29 * 24 * 60 * 60 * 1000);

  const event1 = await prisma.event.create({
    data: {
      organizer_id: organizer1.id,
      title: "Global Tech Summit 2026",
      description: "Premier enterprise architecture and AI conference with global speakers.",
      venue: "Metropolitan Convention Center, Hall A",
      starts_at: event1Starts,
      sales_cutoff_at: event1Cutoff,
      status: "PUBLISHED",
      tiers: {
        create: [
          { name: "VIP All-Access", price: 299.0, total_qty: 30, sold_qty: 0 },
          { name: "General Admission", price: 99.0, total_qty: 100, sold_qty: 0 },
          { name: "Limited Concurrency Tier", price: 50.0, total_qty: 5, sold_qty: 0 },
        ],
      },
    },
    include: { tiers: true },
  });

  // Event 2 (Organizer 2)
  const event2Starts = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000);
  const event2Cutoff = new Date(now.getTime() + 44 * 24 * 60 * 60 * 1000);

  const event2 = await prisma.event.create({
    data: {
      organizer_id: organizer2.id,
      title: "Indie Beats Festival",
      description: "An unforgettable open-air weekend featuring 40+ indie musicians and artists.",
      venue: "Sunset Amphitheatre, Green Park",
      starts_at: event2Starts,
      sales_cutoff_at: event2Cutoff,
      status: "PUBLISHED",
      tiers: {
        create: [
          { name: "Early Bird", price: 45.0, total_qty: 150, sold_qty: 0 },
          { name: "VIP Lounge Pass", price: 180.0, total_qty: 25, sold_qty: 0 },
        ],
      },
    },
    include: { tiers: true },
  });

  // Event 3 (Organizer 1, Sales Cutoff in Past for verification)
  const event3Starts = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const event3Cutoff = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2 hours ago

  const event3 = await prisma.event.create({
    data: {
      organizer_id: organizer1.id,
      title: "Closed Registration Showcase",
      description: "An exclusive workshop where ticket sales cut-off has elapsed.",
      venue: "Innovation Hub, Room 402",
      starts_at: event3Starts,
      sales_cutoff_at: event3Cutoff,
      status: "PUBLISHED",
      tiers: {
        create: [{ name: "Standard Entry", price: 40.0, total_qty: 20, sold_qty: 0 }],
      },
    },
    include: { tiers: true },
  });

  console.log("=================================================");
  console.log("✅ Database successfully seeded!");
  console.log("=================================================");
  console.log("🔑 TEST CREDENTIALS (All passwords: Password123!)");
  console.log("-------------------------------------------------");
  console.log(`ADMIN:       ${admin.email} (ID: ${admin.id})`);
  console.log(`ORGANIZER 1: ${organizer1.email} (ID: ${organizer1.id})`);
  console.log(`ORGANIZER 2: ${organizer2.email} (ID: ${organizer2.id})`);
  console.log(`ATTENDEE 1:  ${attendee1.email} (ID: ${attendee1.id})`);
  console.log(`ATTENDEE 2:  ${attendee2.email} (ID: ${attendee2.id})`);
  console.log(`ATTENDEE 3:  ${attendee3.email} (ID: ${attendee3.id})`);
  console.log("-------------------------------------------------");
  console.log(`Event 1 ID:  ${event1.id}`);
  console.log(`  - Limited Tier (5 tickets): ${event1.tiers.find((t) => t.total_qty === 5)?.id}`);
  console.log(`Event 2 ID:  ${event2.id}`);
  console.log(`Event 3 ID (Cutoff Passed): ${event3.id}`);
  console.log("=================================================");

  return {
    admin,
    organizer1,
    organizer2,
    attendee1,
    attendee2,
    attendee3,
    event1,
    event2,
    event3,
  };
}

if (require.main === module) {
  seed()
    .catch((err) => {
      console.error("❌ Seed failed:", err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
