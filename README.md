# Multi-Tenant Event & Ticket Reservation System

A production-ready event ticketing and reservation platform featuring concurrency-safe inventory holds via PostgreSQL row-level locks, asynchronous payment processing via BullMQ, multi-tenant organizer isolation, real-time analytics, and a simple React dashboard.

---

## Tech Stack
- **Backend**: Node.js, Express, TypeScript, Prisma ORM, PostgreSQL, Redis (ioredis), BullMQ
- **Security**: JWT authentication, bcrypt password hashing, Zod schema validation
- **Frontend**: React (Vite), JavaScript, React Router, Recharts, Vanilla CSS
- **Testing & API**: Jest, Supertest, Postman Collection v2.1

---

## Architecture & Concurrency Model

### PostgreSQL as the Single Source of Truth
Ticket availability is strictly computed and guaranteed by PostgreSQL using row-level locking (`SELECT FOR UPDATE`) inside an ACID database transaction.
```sql
SELECT id, event_id, name, price, total_qty, sold_qty
FROM "ticket_tiers"
WHERE id = $1
FOR UPDATE;
```
- Available inventory is computed as: `total_qty - sold_qty - SUM(active_holds)`.
- **Redis Resilience**: If Redis restarts or its cache is wiped, the system continues to operate and sell tickets 100% correctly with zero overselling, because PostgreSQL row locks and aggregations decide availability. Redis is used solely for caching public event reads and BullMQ job queues.

---

## Running Locally

### 1. Prerequisites
- PostgreSQL running on port `5432` with database `event_db`
- Redis server running on port `6379`

### 2. Backend Setup
```bash
# Install dependencies
npm install

# Run database migrations and generate Prisma client
npx prisma migrate deploy

# Seed database with sample organizers, attendees, and events
npm run seed

# Start development server
npm run dev
# Server runs on http://localhost:3000
```

### 3. Frontend Setup
```bash
cd frontend

# Install dependencies
npm install

# Start Vite dev server
npm run dev
# Frontend runs on http://localhost:5173
```

### 4. Running Automated Tests
```bash
npm test
# Runs all 14 integration test suites covering RBAC, Concurrency (50 parallel requests), Expiry, and Payments
```

---

## Seeded Test Accounts
All accounts use the password: `Password123!`

- **Admin**: `admin@tickets.local`
- **Organizer 1**: `organizer1@fest.local`
- **Organizer 2**: `organizer2@summit.local`
- **Attendee 1**: `attendee1@guest.local`
- **Attendee 2**: `attendee2@guest.local`
- **Attendee 3**: `attendee3@guest.local`

---

## Deploying to Render (Free Tier Friendly)

Render free tier allows a Web Service and PostgreSQL / Redis instances without needing paid background worker services. The architecture runs BullMQ workers **inside the web process** so background jobs execute without extra cost.

### Option A: Standard Node Web Service on Render
1. **Create PostgreSQL & Redis** on Render:
   - Create a **PostgreSQL** instance on Render & copy `Internal Database URL`.
   - Create a **Redis** instance (or use a free Upstash/Aiven Redis) & copy `Redis Connection URL`.
2. **Create New Web Service**:
   - Link your GitHub repository.
   - **Environment**: `Node`
   - **Root Directory**: `.` (leave default)
   - **Build Command**:
     ```bash
     npm install && npm run build
     ```
     *(This runs `prisma generate && tsc`)*
   - **Start Command**:
     ```bash
     npm start
     ```
     *(This automatically runs `npx prisma migrate deploy && node dist/index.js` to ensure the schema is up to date on start before launching)*
3. **Environment Variables**:
   - `DATABASE_URL`: Your PostgreSQL connection string
   - `REDIS_URL`: Your Redis connection string
   - `JWT_SECRET`: A long random secret string
   - `PORT`: `3000`
   - `NODE_ENV`: `production`
4. **Health Check Path**:
   - Set the health check path to `/health` (returns `200 OK` with JSON `{ status: "ok" }`).

### Option B: Docker Web Service on Render
A production multi-stage [Dockerfile](file:///c:/Users/ambattur/Desktop/wt/Dockerfile) is included in the project root.
- Simply choose **Docker** runtime on Render.
- Dockerfile automatically runs `prisma generate`, `tsc`, `prisma migrate deploy`, and starts the server with in-process BullMQ workers.

### Frontend Deployment on Render (Static Site)
1. **Create New Static Site** on Render.
2. Settings:
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Publish Directory**: `dist`
3. Environment Variable:
   - `VITE_API_URL`: `https://<your-backend-name>.onrender.com`
4. Client-side routing is handled by `frontend/public/_redirects` (`/* /index.html 200`).

---

## In-Process BullMQ Background Workers
To accommodate free-tier hosting where separate worker processes are unavailable, BullMQ background workers (`paymentWorker` and `reservationExpiryWorker`) start directly inside the Express server entry point (`src/index.ts`):
1. **Payment Worker**: Consumes jobs from `paymentQueue`, simulates gateway authorization, transitions orders to `PAID`, converts holds to `CONVERTED`, and issues tickets.
2. **Reservation Expiry Worker**: Scheduled via a recurring 60-second BullMQ cron job to scan and transition expired active holds (`expires_at < now()`) to `EXPIRED`.
3. **Graceful Shutdown**: On `SIGTERM` or `SIGINT`, active workers gracefully close their queue connections and flush pending work.

---

## Health Check Endpoint
- **URL**: `GET /health`
- **Response**:
  ```json
  {
    "status": "ok",
    "timestamp": "2026-10-23T12:00:00.000Z",
    "service": "event-ticket-reservation-system"
  }
  ```

---

## Postman API Testing (v2.1)
The `/postman` folder contains:
1. `Multi_Tenant_Ticket_Reservation_System.postman_collection.json`: Full collection covering:
   - **Auth**: Register, Login (Organizer, Attendee, Admin), Me
   - **Events**: List Public, Get Details, Create with Tiers, Update Event
   - **Reservations**: Create Row-Locked Hold, Get Reservation
   - **Payments**: Create Order from Hold, Charge Payment, Check Status
   - **Analytics**: Revenue, Tier Sales, Conversion Rate
   - **Edge Cases**:
     - `409 Conflict`: Attempting to oversell beyond tier capacity
     - `410 Gone`: Checking out an expired reservation hold
     - `403 Forbidden`: Attendee attempting to create an event (RBAC)
     - `403 Forbidden`: Organizer mutating another organizer's event (Tenant Isolation)
2. `Multi_Tenant_Ticket_Reservation_System.postman_environment.json`: Pre-configured environment with `{{baseUrl}}` pointing to `http://localhost:3000` and automatic token capture scripts.
