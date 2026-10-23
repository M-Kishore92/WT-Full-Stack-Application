import express, { Application } from "express";
import cors from "cors";
import authRoutes from "./routes/auth.routes";
import eventRoutes from "./routes/event.routes";
import reservationRoutes from "./routes/reservation.routes";
import orderRoutes from "./routes/order.routes";
import paymentRoutes from "./routes/payment.routes";
import analyticsRoutes from "./routes/analytics.routes";
import { errorHandler } from "./middleware/errorHandler";

export const app: Application = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Health Check
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "event-ticket-reservation-system",
  });
});

// API Routes
app.use("/auth", authRoutes);
app.use("/events", eventRoutes);
app.use("/reservations", reservationRoutes);
app.use("/orders", orderRoutes);
app.use("/payments", paymentRoutes);
app.use("/analytics", analyticsRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
});

// Centralized Error Handler
app.use(errorHandler);
