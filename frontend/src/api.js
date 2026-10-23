// api.js - Centralized fetch helper for calling the backend REST endpoints.
import { getToken } from "./auth";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

// Internal helper to perform HTTP fetch requests with headers and error handling
async function request(path, options = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || `Request failed with status ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

// 1. Auth endpoints
export function registerUser(name, email, password, role) {
  return request("/auth/register", {
    method: "POST",
    body: JSON.stringify({ name, email, password, role }),
  });
}

export function loginUser(email, password) {
  return request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function getCurrentUser() {
  return request("/auth/me", { method: "GET" });
}

// 2. Events endpoints
export function getEvents() {
  return request("/events", { method: "GET" });
}

export function getEventById(id) {
  return request(`/events/${id}`, { method: "GET" });
}

export function createEvent(eventData) {
  return request("/events", {
    method: "POST",
    body: JSON.stringify(eventData),
  });
}

// 3. Reservations endpoints
export function createReservation(tierId, qty) {
  return request("/reservations", {
    method: "POST",
    body: JSON.stringify({ tierId, qty: Number(qty) }),
  });
}

// 4. Orders endpoints
export function createOrder(reservationId, idempotencyKey) {
  return request("/orders", {
    method: "POST",
    body: JSON.stringify({ reservationId, idempotencyKey }),
  });
}

export function getOrder(orderId) {
  return request(`/orders/${orderId}`, { method: "GET" });
}

// 5. Payment endpoints
export function chargePayment(orderId, forceOutcome) {
  return request("/payments/charge", {
    method: "POST",
    body: JSON.stringify({ orderId, forceOutcome }),
  });
}

export function getPaymentStatus(orderId) {
  return request(`/payments/status/${orderId}`, { method: "GET" });
}

// 6. Analytics endpoints (organizer only)
export function getRevenueAnalytics() {
  return request("/analytics/revenue", { method: "GET" });
}

export function getTierAnalytics() {
  return request("/analytics/tiers", { method: "GET" });
}

export function getConversionAnalytics() {
  return request("/analytics/conversion", { method: "GET" });
}
