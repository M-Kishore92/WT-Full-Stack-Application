// Navbar.jsx - Top navigation bar that displays links based on current user role.
import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { getUser, clearAuthSession, isAuthenticated } from "../auth";

// Main navigation bar component
export default function Navbar() {
  const navigate = useNavigate();
  const loggedIn = isAuthenticated();
  const user = getUser();

  // Logs out the user and redirects to login page
  function handleLogout() {
    clearAuthSession();
    navigate("/login");
  }

  return (
    <nav className="navbar">
      <Link to="/" className="navbar-brand">
        🎟️ EventHub
      </Link>

      <div style={{ display: "flex", alignItems: "center" }}>
        <Link to="/">Events</Link>

        {loggedIn && user?.role === "ORGANIZER" && (
          <Link to="/organizer">Dashboard</Link>
        )}

        {loggedIn ? (
          <div className="nav-user">
            <span style={{ fontSize: "0.9rem" }}>{user?.name}</span>
            <span className="role-badge">{user?.role}</span>
            <button onClick={handleLogout} className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: "0.85rem" }}>
              Logout
            </button>
          </div>
        ) : (
          <Link to="/login" className="btn" style={{ padding: "6px 14px", fontSize: "0.85rem" }}>
            Login / Register
          </Link>
        )}
      </div>
    </nav>
  );
}
