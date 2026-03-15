# Password Reset & Change API — Endpoint Reference

Base URL: `/api/auth`

---

## Flow Overview

### Forgot Password (user doesn't know old password)
```
POST /forgot-password  →  POST /verify-otp  →  POST /reset-password
```

### Change Password (user knows old password, wants extra OTP security)
```
POST /forgot-password  →  POST /verify-otp  →  POST /change-password
```

---

## 1. Forgot Password

**`POST /api/auth/forgot-password`**

Generates a 6-digit OTP and sends it to the user's registered email. Valid for **10 minutes**.

### Request Payload
```json
{
  "email": "user@example.com"
}
```

| Field   | Type   | Required | Description              |
|---------|--------|----------|--------------------------|
| `email` | String | Yes      | Registered email address |

### Response — Success `200`
```json
{
  "message": "If this email exists, an OTP has been sent."
}
```
> Same message is returned whether the email exists or not (prevents user enumeration).

### Response — Validation Error `400`
```json
{
  "message": "Please provide your email."
}
```

### Response — Server Error `500`
```json
{
  "message": "Internal server error"
}
```

---

## 2. Verify OTP

**`POST /api/auth/verify-otp`**

Validates the OTP entered by the user. On success, returns a short-lived **`resetToken`** (valid for **15 minutes**) to be used in the next step.

### Request Payload
```json
{
  "email": "user@example.com",
  "otp": "482910"
}
```

| Field   | Type   | Required | Description                    |
|---------|--------|----------|--------------------------------|
| `email` | String | Yes      | Email address OTP was sent to  |
| `otp`   | String | Yes      | 6-digit OTP received via email |

### Response — Success `200`
```json
{
  "message": "OTP verified.",
  "resetToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

| Field        | Type   | Description                                          |
|--------------|--------|------------------------------------------------------|
| `resetToken` | String | Short-lived JWT (15 min) — pass to next step in body |

### Response — Invalid / Expired OTP `400`
```json
{
  "message": "Invalid or expired OTP."
}
```
```json
{
  "message": "OTP has expired. Please request a new one."
}
```
```json
{
  "message": "Invalid OTP."
}
```

### Response — Validation Error `400`
```json
{
  "message": "Email and OTP are required."
}
```

### Response — Server Error `500`
```json
{
  "message": "Internal server error"
}
```

---

## 3. Reset Password

**`POST /api/auth/reset-password`**

Use this when the user **does not know their old password**. Sets a new password using only the `resetToken` from Step 2.

### Request Payload
```json
{
  "resetToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "newPassword": "newSecurePass123"
}
```

| Field         | Type   | Required | Description                              |
|---------------|--------|----------|------------------------------------------|
| `resetToken`  | String | Yes      | Token received from `/verify-otp`        |
| `newPassword` | String | Yes      | New password (minimum 6 characters)      |

### Response — Success `200`
```json
{
  "message": "Password reset successful. You can now log in."
}
```

### Response — Validation Errors `400`
```json
{
  "message": "Reset token and new password are required."
}
```
```json
{
  "message": "Password must be at least 6 characters."
}
```
```json
{
  "message": "Invalid or expired reset token."
}
```
```json
{
  "message": "Reset token already used or invalid."
}
```

### Response — Server Error `500`
```json
{
  "message": "Internal server error"
}
```

> **Note:** `resetToken` is invalidated immediately after a successful reset. It cannot be reused.

---

## 4. Change Password

**`POST /api/auth/change-password`**

Use this when the user **knows their old password** but wants OTP verification as an extra security step. Requires `resetToken` from Step 2 **plus** the old password.

### Request Payload
```json
{
  "resetToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "oldPassword": "currentPassword123",
  "newPassword": "newSecurePass456"
}
```

| Field         | Type   | Required | Description                              |
|---------------|--------|----------|------------------------------------------|
| `resetToken`  | String | Yes      | Token received from `/verify-otp`        |
| `oldPassword` | String | Yes      | User's current password                  |
| `newPassword` | String | Yes      | New password (minimum 6 characters)      |

### Response — Success `200`
```json
{
  "message": "Password changed successfully."
}
```

### Response — Validation Errors `400`
```json
{
  "message": "Reset token, old password, and new password are required."
}
```
```json
{
  "message": "New password must be at least 6 characters."
}
```
```json
{
  "message": "Invalid or expired reset token."
}
```
```json
{
  "message": "Reset token already used or invalid."
}
```
```json
{
  "message": "Old password is incorrect."
}
```
```json
{
  "message": "New password must be different from the old password."
}
```

### Response — Server Error `500`
```json
{
  "message": "Internal server error"
}
```

> **Note:** `resetToken` is invalidated immediately after a successful change. It cannot be reused.

---

## Token Lifecycle

```
forgotPassword called
       │
       ▼
OTP generated → hashed → saved to DB (expires in 10 min)
       │
       ▼ (user submits OTP)
verifyOtp called
       │
   OTP valid?
       │ Yes
       ▼
OTP cleared from DB
resetToken (JWT, 15 min) saved to DB → returned to client
       │
       ▼ (user submits resetToken)
resetPassword  OR  changePassword called
       │
   resetToken valid & matches DB?
       │ Yes
       ▼
Password updated
resetToken cleared from DB  ← token is now dead
```

---

## Environment Variables Required

| Variable      | Description                                    |
|---------------|------------------------------------------------|
| `EMAIL_USER`  | Gmail address used to send OTP emails          |
| `EMAIL_PASS`  | Gmail App Password (not account password)      |
| `JWT_SECRET`  | Secret used to sign and verify reset tokens    |

> Generate a Gmail App Password at: Google Account → Security → 2-Step Verification → App Passwords
