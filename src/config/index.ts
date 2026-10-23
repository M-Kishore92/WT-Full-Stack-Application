import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  databaseUrl: process.env.DATABASE_URL || "postgresql://postgres@localhost:5432/event_db?schema=public",
  redisUrl: process.env.REDIS_URL || "redis://127.0.0.1:6379",
  jwtSecret: process.env.JWT_SECRET || "super-secret-jwt-key-for-development-32-chars-min",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "24h",
  cacheTTL: 300, // 5 minutes in seconds
};
