// EventDetailPage.jsx - Displays event details, ticket tier selection, 10-minute hold countdown, and checkout flow.
import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getEventById, createReservation, createOrder, chargePayment, getPaymentStatus } from "../api";
import { isAuthenticated } from "../auth";

// Detailed event view with reservation countdown timer and payment polling
export default function EventDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [event, setEvent] = useState(null);
  const [selectedTierId, setSelectedTierId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Reservation state
  const [reservation, setReservation] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null); // seconds
  const [holdExpired, setHoldExpired] = useState(false);

  // Order & Payment state
  const [order, setOrder] = useState(null);
  const [paymentStatus, setPaymentStatus] = useState(""); // PROCESSING, PAID, FAILED
  const [paymentMessage, setPaymentMessage] = useState("");
  const [issuedTickets, setIssuedTickets] = useState([]);

  const pollIntervalRef = useRef(null);

  // Loads event details when page opens
  async function loadEvent() {
    try {
      const data = await getEventById(id);
      setEvent(data);
      if (data.tiers && data.tiers.length > 0) {
        setSelectedTierId(data.tiers[0].id);
      }
    } catch (err) {
      setError(err.message || "Failed to load event");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEvent();
  }, [id]);

  // Handles 10-minute countdown timer tick
  useEffect(() => {
    if (!reservation?.expires_at) return;

    function updateCountdown() {
      const expiry = new Date(reservation.expires_at).getTime();
      const now = new Date().getTime();
      const diffSec = Math.floor((expiry - now) / 1000);

      if (diffSec <= 0) {
        setTimeLeft(0);
        setHoldExpired(true);
      } else {
        setTimeLeft(diffSec);
      }
    }

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [reservation]);

  // Clean up poll interval on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  // Formats seconds into MM:SS
  function formatTime(seconds) {
    if (seconds === null || seconds <= 0) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  // Reserves tickets for 10 minutes
  async function handleReserve(e) {
    e.preventDefault();
    if (!isAuthenticated()) {
      navigate("/login");
      return;
    }

    setError("");
    setHoldExpired(false);

    try {
      const res = await createReservation(selectedTierId, quantity);
      setReservation(res.reservation);
      // Reload event to see updated tier counts
      loadEvent();
    } catch (err) {
      if (err.status === 409) {
        setError("Sold Out: Not enough tickets available in this tier.");
      } else if (err.status === 400) {
        setError(err.message || "Cannot reserve: Sales cut-off passed or invalid request.");
      } else {
        setError(err.message || "Reservation failed");
      }
    }
  }

  // Creates the order and initiates payment charge, then polls payment status
  async function handlePayNow() {
    if (holdExpired) return;
    setError("");
    setPaymentStatus("PROCESSING");
    setPaymentMessage("Initiating payment...");

    try {
      // 1. Create order with unique idempotencyKey
      const idempotencyKey = `frontend-order-${reservation.id}-${Date.now()}`;
      const orderRes = await createOrder(reservation.id, idempotencyKey);
      const createdOrder = orderRes.order;
      setOrder(createdOrder);

      // 2. Submit payment charge
      await chargePayment(createdOrder.id, "APPROVE");
      setPaymentMessage("Payment processing... please wait");

      // 3. Poll payment status every 1.5 seconds until PAID or FAILED
      pollIntervalRef.current = setInterval(async () => {
        try {
          const statusRes = await getPaymentStatus(createdOrder.id);
          const currentStatus = statusRes.status || statusRes.order?.status;
          const currentTickets = statusRes.tickets || statusRes.order?.tickets || [];
          if (currentStatus === "PAID") {
            clearInterval(pollIntervalRef.current);
            setPaymentStatus("PAID");
            setPaymentMessage("Payment successful! Your tickets are issued below.");
            setIssuedTickets(currentTickets);
            loadEvent();
          } else if (currentStatus === "FAILED") {
            clearInterval(pollIntervalRef.current);
            setPaymentStatus("FAILED");
            setPaymentMessage("Payment failed. Your hold has been released.");
            loadEvent();
          }
        } catch (pollErr) {
          console.error("Polling error:", pollErr);
        }
      }, 1500);
    } catch (err) {
      setPaymentStatus("");
      if (err.status === 410) {
        setHoldExpired(true);
        setError("Your hold has expired. Please select tickets and reserve again.");
      } else {
        setError(err.message || "Payment checkout failed");
      }
    }
  }

  if (loading) return <div className="container">Loading event details...</div>;
  if (!event) return <div className="container">Event not found.</div>;

  return (
    <div className="container" style={{ maxWidth: "750px" }}>
      <button onClick={() => navigate("/")} className="btn btn-secondary" style={{ marginBottom: "16px" }}>
        ← Back to Events
      </button>

      <div className="card">
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "8px" }}>{event.title}</h1>
        <p className="event-meta">📍 Venue: {event.venue}</p>
        <p className="event-meta">
          🗓️ Event Date: {new Date(event.starts_at).toLocaleString()}
        </p>
        <p className="event-meta" style={{ color: "#b45309" }}>
          ⏰ Sales Cutoff: {new Date(event.sales_cutoff_at).toLocaleString()}
        </p>
        <p style={{ marginTop: "12px", color: "#334155" }}>
          {event.description || "No additional description."}
        </p>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {/* Reservation Active Banner & Countdown Timer */}
      {reservation && (
        <div className="card">
          <div className="countdown-banner">
            <div>
              <strong>Hold Reserved!</strong> Reservation ID: #{reservation.id.slice(0, 8)}...
            </div>
            <div className="timer-digits">
              ⏱️ {formatTime(timeLeft)}
            </div>
          </div>

          {holdExpired ? (
            <div className="alert alert-danger">
              ⚠️ Your hold expired. The tickets were released back to the event.
            </div>
          ) : paymentStatus === "PAID" ? (
            <div>
              <div className="alert alert-success">
                🎉 {paymentMessage}
              </div>
              <h3 style={{ margin: "16px 0 8px" }}>Your Tickets:</h3>
              {issuedTickets.map((t) => (
                <div key={t.id} style={{ background: "#f8fafc", border: "1px dashed #2563eb", padding: "12px", borderRadius: "6px", marginBottom: "8px" }}>
                  <strong>Ticket Code:</strong> <span style={{ fontFamily: "monospace", color: "#2563eb" }}>{t.code || t.ticket_code}</span>
                </div>
              ))}
            </div>
          ) : paymentStatus === "FAILED" ? (
            <div className="alert alert-danger">
              ❌ {paymentMessage}
            </div>
          ) : paymentStatus === "PROCESSING" ? (
            <div className="alert alert-info">
              ⏳ {paymentMessage}
            </div>
          ) : (
            <div>
              <p style={{ marginBottom: "14px", color: "#475569" }}>
                You have held <strong>{reservation.qty} ticket(s)</strong>. Complete payment before the timer reaches 0 to confirm your seats.
              </p>
              <button
                onClick={handlePayNow}
                disabled={holdExpired}
                className="btn"
                style={{ width: "100%", padding: "12px", fontSize: "1.05rem" }}
              >
                💳 Pay Now
              </button>
            </div>
          )}
        </div>
      )}

      {/* Ticket Selection and Reservation Form */}
      {(!reservation || holdExpired) && (
        <div className="card">
          <h2 className="card-title">Select Ticket Tier</h2>
          <form onSubmit={handleReserve}>
            <div style={{ margin: "16px 0" }}>
              {event.tiers && event.tiers.map((tier) => {
                const remaining = Math.max(0, tier.total_qty - tier.sold_qty);
                const isSelected = selectedTierId === tier.id;
                return (
                  <div
                    key={tier.id}
                    onClick={() => setSelectedTierId(tier.id)}
                    className="tier-item"
                    style={{
                      cursor: "pointer",
                      borderColor: isSelected ? "#2563eb" : "#e2e8f0",
                      backgroundColor: isSelected ? "#eff6ff" : "#ffffff",
                    }}
                  >
                    <div>
                      <div className="tier-name">{tier.name}</div>
                      <div className="tier-remaining">
                        {remaining > 0 ? `${remaining} tickets available (${tier.sold_qty} sold)` : "Sold out"}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="tier-price">${Number(tier.price).toFixed(2)}</div>
                      <input
                        type="radio"
                        name="tier"
                        checked={isSelected}
                        onChange={() => setSelectedTierId(tier.id)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="form-group" style={{ maxWidth: "160px" }}>
              <label>Quantity</label>
              <input
                type="number"
                min="1"
                max="10"
                required
                className="form-control"
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
              />
            </div>

            <button type="submit" className="btn" style={{ width: "100%", padding: "10px" }}>
              🎟️ Reserve Tickets (10-min Hold)
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
