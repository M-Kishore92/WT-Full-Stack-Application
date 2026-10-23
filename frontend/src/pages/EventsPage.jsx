// EventsPage.jsx - Public page showing all available events with title, venue, and date.
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getEvents } from "../api";

// Displays the public catalog of events
export default function EventsPage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Fetches public events when component loads
  useEffect(() => {
    async function loadEvents() {
      try {
        const data = await getEvents();
        setEvents(data.events || []);
      } catch (err) {
        setError(err.message || "Failed to load events");
      } finally {
        setLoading(false);
      }
    }
    loadEvents();
  }, []);

  return (
    <div className="container">
      <h1 style={{ fontSize: "1.8rem", fontWeight: 700, marginBottom: "8px" }}>Explore Events</h1>
      <p style={{ color: "#64748b", marginBottom: "20px" }}>
        Discover exciting events and reserve your tickets before they sell out!
      </p>

      {error && <div className="alert alert-danger">{error}</div>}

      {loading ? (
        <p>Loading events...</p>
      ) : events.length === 0 ? (
        <div className="card">No events found. Check back later!</div>
      ) : (
        <div className="event-grid">
          {events.map((evt) => (
            <div key={evt.id} className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div>
                <h3 className="card-title">{evt.title}</h3>
                <p className="event-meta">📍 {evt.venue}</p>
                <p className="event-meta">
                  🗓️ {new Date(evt.starts_at).toLocaleDateString()} at{" "}
                  {new Date(evt.starts_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
                <p style={{ fontSize: "0.9rem", color: "#475569", margin: "10px 0" }}>
                  {evt.description || "No description provided."}
                </p>
              </div>

              <div style={{ marginTop: "12px", borderTop: "1px solid #f1f5f9", paddingTop: "12px" }}>
                <Link to={`/events/${evt.id}`} className="btn" style={{ width: "100%", textAlign: "center" }}>
                  View Tickets & Reserve
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
