# Mughal Mahal - Hotel Management & Booking System

A full-stack hotel website with online booking and an admin panel, built with the MERN stack.

> **Final Year Project.** Built by a team of 3 students as our university FYP.

<!-- Add 3-4 screenshots here: home page, room booking, dining menu, admin dashboard -->
<!-- ![Home page](docs/home.png) -->

## Features

**Guest website**
- Browse rooms with details, images and availability, and book online
- Dining: menu, table booking and food orders
- Redbox (takeaway / delivery) orders
- Banquet hall and conference room booking requests
- Account signup with email OTP verification, login and password reset by email
- Profile page with booking and order history
- Built-in help chatbot and contact form

**Admin panel**
- Dashboard with bookings, revenue and top-selling items, with date filters
- Manage rooms, dining items, banquet halls, conference rooms and events
- View and update room bookings, dining orders, Redbox orders and banquet requests
- Banquet schedule and seasonal pricing
- Receipts and invoices
- Registered users and contact messages

## Tech stack

| Part | Technology |
| --- | --- |
| Frontend | React 19, Vite, React Router, React Bootstrap, Framer Motion, Axios |
| Backend | Node.js, Express 5, Mongoose, JWT, bcrypt, Multer, Nodemailer, Helmet |
| Database | MongoDB |
| Extra | `WinFormsGoogleMap` - a small C# Windows Forms app that shows the hotel on Google Maps |
| Hosting | Vercel (frontend and backend) |

## Project structure

```
Frontend/            React app (guest website + admin panel)
  src/Components/    Shared and page components
  src/views/         Pages (guest and admin)
backend/             Express API
  controllers/       Request logic
  models/            Mongoose models
  routes/            API routes
  middlewares/       Admin authentication
  services/          Email and startup checks
  data/              Seed data (rooms, menu, tables)
WinFormsGoogleMap/   C# desktop map app
```

## Run it locally

You need Node.js 20+ and MongoDB (local or MongoDB Atlas).

```bash
# 1. Install dependencies
npm install --prefix backend
npm install --prefix Frontend

# 2. Create the backend settings file and fill it in
cp backend/.env.example backend/.env

# 3. Start frontend and backend together
npm run dev
```

- Website: http://localhost:5173
- API: http://localhost:3000/api
- Admin panel: http://localhost:5173/admin

### Settings (`backend/.env`)

| Name | What it is |
| --- | --- |
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` | Long random string for login tokens (required) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | First admin account, created on first start |
| `EMAIL_USER`, `EMAIL_PASS` | Gmail address and app password for OTP emails |
| `FRONTEND_URL` | Frontend URL, used for CORS and email links |

To point the frontend at your own backend, set `VITE_API_URL` in `Frontend/.env`.

## Security notes

- Passwords are hashed with bcrypt and admin routes need a signed JWT.
- No secrets or customer data are stored in this repository. `.env` files, uploaded
  profile photos and booking data files are ignored by git.

## Known limitations

- Guest accounts are identified by username on the profile and booking-history
  endpoints. Adding token-based login for guests is the next planned improvement.
- There are no automated tests yet.
