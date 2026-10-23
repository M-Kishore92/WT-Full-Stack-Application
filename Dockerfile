# Multi-Tenant Event & Ticket Reservation System - Production Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests & Prisma schema
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci

# Copy project source
COPY . .

# Generate Prisma Client & compile TypeScript
RUN npx prisma generate && npm run build

# --- Production Runner ---
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install OpenSSL required by Prisma engine
RUN apk add --no-cache openssl

# Copy dependency manifests & Prisma schema
COPY package*.json ./
COPY prisma ./prisma/

# Install only production dependencies
RUN npm ci --only=production

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

EXPOSE 3000

# Migrate database and start web server + in-process BullMQ workers
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
