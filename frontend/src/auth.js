// auth.js - Helper functions for managing user login token and session in browser localStorage.

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";

// Saves the JWT token and user info (id, name, email, role) into localStorage
export function setAuthSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

// Retrieves the saved JWT token from localStorage
export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

// Retrieves the parsed user object from localStorage
export function getUser() {
  const user = localStorage.getItem(USER_KEY);
  if (!user) return null;
  try {
    return JSON.parse(user);
  } catch (e) {
    return null;
  }
}

// Clears the token and user info when logging out
export function clearAuthSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

// Checks if someone is currently logged in
export function isAuthenticated() {
  return Boolean(getToken());
}
