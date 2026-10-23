import supertest from "supertest";
import { app } from "../src/app";
import { prisma } from "../src/config/prisma";
import { seed } from "../scripts/seed";
import jwt from "jsonwebtoken";
import { config } from "../src/config";
import { Role } from "@prisma/client";
import { redis } from "../src/config/redis";
import { EventEmitter } from "events";

// Prevent MaxListenersExceededWarning when multiple suites share the same server
EventEmitter.defaultMaxListeners = 100;

export const request = supertest(app);

export function generateToken(user: { id: string; email: string; role: Role; name: string }): string {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    config.jwtSecret,
    { expiresIn: "1h" }
  );
}

export async function resetAndSeed() {
  return await seed();
}

export async function cleanupTestResources() {
  const { closeQueues } = await import("../src/jobs/queues");
  await closeQueues();
  await prisma.$disconnect();
}


