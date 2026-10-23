# FRONTEND_EXPLAINED.md

Welcome to the frontend explanation guide! This document describes every file built for the EventHub frontend in plain, beginner-friendly English, followed by a step-by-step walkthrough of how a booking flows from clicking "Reserve" to receiving an issued ticket.

---

## 1. File-by-File Breakdown

### `src/auth.js`
This file contains helper functions that manage user sessions in browser `localStorage`. When a user logs in, `setAuthSession(token, user)` saves the JWT token and the user's profile (name, email, role). Other functions like `getToken()`, `getUser()`, `isAuthenticated()`, and `clearAuthSession()` provide clean ways to check if someone is logged in or log them out without repeating raw storage calls across components.

### `src/api.js`
This file is the single control center for all network requests to the backend Express REST API. It uses the browser's native `fetch` API and reads the base URL from `VITE_API_URL` (defaulting to `http://localhost:3000`). It automatically adds the `Authorization: Bearer <token>` header if a token exists in `localStorage`. All endpoints for authentication, events, reservations, orders, payments, and analytics are grouped here as exported JavaScript functions.

### `src/styles.css`
This file contains all custom styling for the application using plain, vanilla CSS without requiring any external UI libraries. It defines standard typography, a responsive grid for event cards, colored badges for user roles, card layouts, form controls, alert banners (for errors and success states), and styles for the 10-minute countdown timer and analytics metric cards.

### `src/components/Navbar.jsx`
This component renders the top navigation bar. It displays the EventHub logo, a link to the public events page, and dynamically renders links according to the logged-in user's role. If the user is logged in as an `ORGANIZER`, it reveals a link to the Organizer Dashboard. It also displays the user's name and role badge, along with a "Logout" button that clears the token and redirects to the login page.

### `src/pages/AuthPage.jsx`
This page handles both User Login and Registration in a single, user-friendly card. A toggle button switches between "Login" and "Register". When registering, users can choose whether their role is `ATTENDEE` (to browse and buy tickets) or `ORGANIZER` (to create events and view charts). Upon successful login or registration, the JWT and user profile are saved and the user is redirected to their appropriate landing page.

### `src/pages/EventsPage.jsx`
This is the public home catalog page where all attendees and visitors can browse available events. It calls `GET /events` through `api.js` and displays each event in a clean card showing its title, venue, scheduled start date/time, and description. Each event card includes a "View Tickets & Reserve" button that links to the event's detail page.

### `src/pages/EventDetailPage.jsx`
This is the core booking page. It displays full event information, sales cut-off deadlines, and available ticket tiers with remaining ticket counts. Attendees choose a tier and quantity, then click "Reserve". This triggers a 10-minute hold and initiates a live countdown timer (`MM:SS`). Clicking "Pay Now" creates the order, triggers the payment charge, and polls the payment status until the order is `PAID`, revealing the attendee's unique generated ticket codes. If the timer reaches 0 or tickets sell out, it shows descriptive error alerts (handling HTTP 409 and 410).

### `src/pages/OrganizerDashboardPage.jsx`
This dashboard is restricted to users with the `ORGANIZER` role (redirecting any attendees to the homepage). It contains:
1. **Event Creation Form**: Allows the organizer to publish an event with dates, venue, and initial ticket tier pricing and quantity.
2. **My Events List**: Displays all events created and managed by this organizer.
3. **Analytics Section**: Displays 3 high-level KPI cards (Total Revenue, Tickets Sold, Conversion Rate %) and 2 Recharts visualizations (a Line Chart of daily revenue and a Bar Chart of ticket sales per tier). The dashboard automatically re-polls the analytics endpoints every 10 seconds to keep metrics fresh.

### `src/App.jsx`
This is the root component that sets up client-side page routing using `react-router-dom`. It places the `Navbar` across all screens and matches URL paths (`/`, `/events/:id`, `/login`, `/organizer`) to their respective page components. Any unrecognized URL path redirects back to the home page.

### `public/_redirects`
This static configuration file tells hosting providers (like Render or Netlify) to redirect all frontend URL routes (`/*`) to `/index.html` with an HTTP 200 status code. This allows React Router to handle page navigation even when users refresh a subpage.

---

## 2. Booking Walkthrough: From Click to Paid Ticket

Here is how a booking flows through the system from the user's first click to receiving a confirmed ticket:

1. **Browsing & Selecting**:
   The user navigates to `/events/:id`. The page queries `GET /events/:id` to show available ticket tiers and real-time remaining capacities.
2. **Hold Reservation (10-Minute Lock)**:
   The user selects a ticket tier, enters quantity `1`, and clicks **"Reserve Tickets"**.
   - The frontend calls `POST /reservations` with `{ tierId, qty }`.
   - The backend checks inventory in Redis, decrements available tickets, and creates an `ACTIVE` reservation record with an expiration timestamp set to 10 minutes in the future.
   - The frontend receives the reservation and starts a live countdown timer.
3. **Order Creation (Idempotent)**:
   The attendee clicks **"Pay Now"**.
   - The frontend generates a unique `idempotencyKey` and calls `POST /orders` with `{ reservationId, idempotencyKey }`.
   - The backend validates that the hold has not expired (returning HTTP 410 if it has) and creates a `PENDING` order linked to the reservation.
4. **Payment Processing**:
   - The frontend calls `POST /payments/charge` with `{ orderId }`.
   - The backend records an `INITIATED` transaction and enqueues a background payment job into BullMQ.
   - The frontend shows `"Payment processing... please wait"`.
5. **Status Polling**:
   - The frontend polls `GET /payments/status/:orderId` every 1.5 seconds.
   - Once the payment job finishes, the order status transitions to `PAID`, the reservation transitions to `CONVERTED`, and attendee tickets with unique secure codes are generated.
6. **Confirmation & Ticket Display**:
   - The frontend poll detects `status: "PAID"`.
   - The polling stops, and the page displays a celebration message along with the attendee's newly issued ticket codes.
