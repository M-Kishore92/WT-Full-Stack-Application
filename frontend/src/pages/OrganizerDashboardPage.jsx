// OrganizerDashboardPage.jsx - Dashboard for organizers to create events, see their events, and view live analytics.
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getUser } from "../auth";
import {
  getEvents,
  createEvent,
  getRevenueAnalytics,
  getTierAnalytics,
  getConversionAnalytics,
} from "../api";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from "recharts";

// Organizer dashboard component with event creation and 10s auto-refreshing analytics
export default function OrganizerDashboardPage() {
  const navigate = useNavigate();
  const user = getUser();

  // Redirect non-organizers
  useEffect(() => {
    if (!user || user.role !== "ORGANIZER") {
      navigate("/");
    }
  }, [user, navigate]);

  const [myEvents, setMyEvents] = useState([]);
  const [revenueData, setRevenueData] = useState({ summary: { totalRevenue: 0, totalOrders: 0 }, daily: [] });
  const [tierData, setTierData] = useState({ tiers: [] });
  const [conversionData, setConversionData] = useState({ conversionRatePercent: 0, reservations: {}, orders: {} });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Create event form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [venue, setVenue] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [salesCutoffAt, setSalesCutoffAt] = useState("");
  const [tierName, setTierName] = useState("General Admission");
  const [tierPrice, setTierPrice] = useState("50");
  const [tierQty, setTierQty] = useState("100");

  // Fetches organizer's events and all 3 analytics endpoints
  async function loadDashboardData() {
    try {
      const [eventsRes, revRes, tiersRes, convRes] = await Promise.all([
        getEvents(),
        getRevenueAnalytics().catch(() => ({ summary: { totalRevenue: 0, totalOrders: 0 }, daily: [] })),
        getTierAnalytics().catch(() => ({ tiers: [] })),
        getConversionAnalytics().catch(() => ({ conversionRatePercent: 0 })),
      ]);

      setMyEvents(eventsRes.events || []);
      setRevenueData(revRes);
      setTierData(tiersRes);
      setConversionData(convRes);
    } catch (err) {
      setError(err.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }

  // Load initially and setup 10-second auto-refresh
  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(loadDashboardData, 10000); // refresh every 10s
    return () => clearInterval(interval);
  }, []);

  // Handles creating a new event with an initial ticket tier
  async function handleCreateEvent(e) {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    try {
      const payload = {
        title,
        description,
        venue,
        starts_at: new Date(startsAt).toISOString(),
        sales_cutoff_at: new Date(salesCutoffAt).toISOString(),
        tiers: [
          {
            name: tierName,
            price: Number(tierPrice),
            total_qty: Number(tierQty),
          },
        ],
      };

      await createEvent(payload);
      setSuccessMsg("Event created successfully!");

      // Reset form fields
      setTitle("");
      setDescription("");
      setVenue("");
      setStartsAt("");
      setSalesCutoffAt("");

      loadDashboardData();
    } catch (err) {
      setError(err.message || "Failed to create event");
    }
  }

  // Calculate total tickets sold across tiers
  const totalTicketsSold = (tierData.tiers || []).reduce((sum, t) => sum + (t.soldQty || 0), 0);

  // Prepare tier chart data (clean labels for Recharts)
  const tierChartData = (tierData.tiers || []).map((t) => ({
    name: t.tierName,
    Sold: t.soldQty,
    Remaining: t.remainingQty,
  }));

  if (loading) return <div className="container">Loading organizer dashboard...</div>;

  return (
    <div className="container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <h1 style={{ fontSize: "1.8rem", fontWeight: 700 }}>Organizer Dashboard</h1>
        <span style={{ fontSize: "0.85rem", color: "#64748b" }}>Auto-refreshes every 10s</span>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {successMsg && <div className="alert alert-success">{successMsg}</div>}

      {/* Analytics KPI Number Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Revenue</div>
          <div className="stat-value" style={{ color: "#16a34a" }}>
            ${Number(revenueData.summary?.totalRevenue || 0).toFixed(2)}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Tickets Sold</div>
          <div className="stat-value" style={{ color: "#2563eb" }}>
            {totalTicketsSold}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Conversion Rate</div>
          <div className="stat-value" style={{ color: "#9333ea" }}>
            {conversionData.conversionRatePercent || 0}%
          </div>
        </div>
      </div>

      {/* Analytics Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: "20px", marginBottom: "24px" }}>
        {/* Line Chart: Revenue per Day */}
        <div className="card">
          <h3 className="card-title">Revenue per Day ($)</h3>
          <div style={{ height: "240px", width: "100%", marginTop: "12px" }}>
            {revenueData.daily && revenueData.daily.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={revenueData.daily}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip />
                  <Line type="monotone" dataKey="revenue" stroke="#16a34a" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p style={{ color: "#94a3b8", textAlign: "center", paddingTop: "80px" }}>
                No paid orders recorded yet
              </p>
            )}
          </div>
        </div>

        {/* Bar Chart: Tickets Sold per Tier */}
        <div className="card">
          <h3 className="card-title">Tickets Sold per Tier</h3>
          <div style={{ height: "240px", width: "100%", marginTop: "12px" }}>
            {tierChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tierChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Sold" fill="#2563eb" />
                  <Bar dataKey="Remaining" fill="#cbd5e1" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p style={{ color: "#94a3b8", textAlign: "center", paddingTop: "80px" }}>
                No tiers created yet
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Form: Create New Event */}
      <div className="card">
        <h2 className="card-title">Create New Event</h2>
        <form onSubmit={handleCreateEvent}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
            <div className="form-group">
              <label>Event Title</label>
              <input
                type="text"
                required
                className="form-control"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Tech Innovators Summit"
              />
            </div>

            <div className="form-group">
              <label>Venue</label>
              <input
                type="text"
                required
                className="form-control"
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
                placeholder="Grand Hall, San Francisco"
              />
            </div>
          </div>

          <div className="form-group">
            <label>Description</label>
            <textarea
              className="form-control"
              rows="2"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this event about?"
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
            <div className="form-group">
              <label>Event Starts At</label>
              <input
                type="datetime-local"
                required
                className="form-control"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Sales Cut-off Date</label>
              <input
                type="datetime-local"
                required
                className="form-control"
                value={salesCutoffAt}
                onChange={(e) => setSalesCutoffAt(e.target.value)}
              />
            </div>
          </div>

          <h3 style={{ fontSize: "1rem", margin: "14px 0 8px", color: "#334155" }}>Initial Ticket Tier</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px" }}>
            <div className="form-group">
              <label>Tier Name</label>
              <input
                type="text"
                required
                className="form-control"
                value={tierName}
                onChange={(e) => setTierName(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Price ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                required
                className="form-control"
                value={tierPrice}
                onChange={(e) => setTierPrice(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Total Quantity</label>
              <input
                type="number"
                min="1"
                required
                className="form-control"
                value={tierQty}
                onChange={(e) => setTierQty(e.target.value)}
              />
            </div>
          </div>

          <button type="submit" className="btn" style={{ marginTop: "10px" }}>
            ➕ Publish Event
          </button>
        </form>
      </div>

      {/* List: My Events */}
      <div className="card">
        <h2 className="card-title">My Managed Events ({myEvents.length})</h2>
        {myEvents.length === 0 ? (
          <p style={{ color: "#64748b" }}>You haven't created any events yet.</p>
        ) : (
          <div style={{ display: "grid", gap: "12px", marginTop: "12px" }}>
            {myEvents.map((evt) => (
              <div
                key={evt.id}
                style={{
                  border: "1px solid #e2e8f0",
                  padding: "12px",
                  borderRadius: "6px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <strong>{evt.title}</strong>
                  <div style={{ fontSize: "0.85rem", color: "#64748b" }}>
                    📍 {evt.venue} | Starts: {new Date(evt.starts_at).toLocaleDateString()}
                  </div>
                </div>
                <div>
                  <span className="role-badge" style={{ marginRight: "10px" }}>
                    {evt.status}
                  </span>
                  <button
                    onClick={() => navigate(`/events/${evt.id}`)}
                    className="btn btn-secondary"
                    style={{ padding: "4px 10px", fontSize: "0.85rem" }}
                  >
                    View Page
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
