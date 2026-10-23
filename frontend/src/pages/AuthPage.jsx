// AuthPage.jsx - Combined page allowing attendees and organizers to login or register.
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginUser, registerUser } from "../api";
import { setAuthSession } from "../auth";

// Auth page handling both Login and Registration forms
export default function AuthPage() {
  const navigate = useNavigate();
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("ATTENDEE"); // ATTENDEE or ORGANIZER
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Submits the login or registration form
  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isRegister) {
        const res = await registerUser(name, email, password, role);
        setAuthSession(res.token, res.user);
        if (res.user.role === "ORGANIZER") {
          navigate("/organizer");
        } else {
          navigate("/");
        }
      } else {
        const res = await loginUser(email, password);
        setAuthSession(res.token, res.user);
        if (res.user.role === "ORGANIZER") {
          navigate("/organizer");
        } else {
          navigate("/");
        }
      }
    } catch (err) {
      setError(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: "440px", marginTop: "40px" }}>
      <div className="card">
        <h2 className="card-title" style={{ textAlign: "center", marginBottom: "16px" }}>
          {isRegister ? "Create an Account" : "Sign In to EventHub"}
        </h2>

        {error && <div className="alert alert-danger">{error}</div>}

        <form onSubmit={handleSubmit}>
          {isRegister && (
            <div className="form-group">
              <label>Full Name</label>
              <input
                type="text"
                required
                className="form-control"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
              />
            </div>
          )}

          <div className="form-group">
            <label>Email Address</label>
            <input
              type="email"
              required
              className="form-control"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              required
              className="form-control"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {isRegister && (
            <div className="form-group">
              <label>Select Role</label>
              <select
                className="form-control"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                <option value="ATTENDEE">Attendee (Browse & Buy Tickets)</option>
                <option value="ORGANIZER">Organizer (Host Events & Analytics)</option>
              </select>
            </div>
          )}

          <button type="submit" disabled={loading} className="btn" style={{ width: "100%", marginTop: "8px" }}>
            {loading ? "Processing..." : isRegister ? "Register" : "Login"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: "16px", fontSize: "0.9rem" }}>
          {isRegister ? (
            <span>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => { setIsRegister(false); setError(""); }}
                style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", textDecoration: "underline" }}
              >
                Sign in
              </button>
            </span>
          ) : (
            <span>
              Need an account?{" "}
              <button
                type="button"
                onClick={() => { setIsRegister(true); setError(""); }}
                style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", textDecoration: "underline" }}
              >
                Register here
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
