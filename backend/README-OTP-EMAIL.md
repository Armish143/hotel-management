# Booking OTP Email Setup

To enable registration OTP verification by email, follow these steps:

1. Create a `.env` file in `backend/`:

Copy `backend/.env.example` to `backend/.env` and fill in `EMAIL_USER` and `EMAIL_PASS` (a Gmail app password).

2. Install backend dependencies:

```
npm install
```

3. Run the backend server:

```
npm start
```

4. The new booking auth routes are:

- `POST /api/booking/register-init` for registration and OTP send
- `POST /api/booking/verify-otp` for email OTP verification
- `POST /api/booking/login` for verified user login

5. Uploads for profile images will be stored in `backend/uploads/profile/`.

> Note: Using Gmail SMTP requires the app password and may need Google account security settings configured.
