# Mail2Offer Backend Audit Report

This document outlines the security issues, bugs, and architectural concerns found within the `mail2offer` backend codebase. 

---

## 1. Security Vulnerabilities

### 1.1 CSRF Vulnerability in Google OAuth Callback
**Location:** `modules/auth/google.routes.js` and `modules/auth/google.controller.js`
**Severity:** Critical
**Details:** The `/google/callback` route is not protected by the `auth.middleware`, and the `googleCallback` controller directly takes the `state` parameter from the query string and uses it as the `userId`. 
**Exploit:** An attacker can initiate an OAuth flow, capture the redirect URL with their valid code, and swap out the `state` with a victim's `userId`. This links the attacker's Google account to the victim's Mail2Offer profile.
**Recommendation:** 
- Protect the `/google/callback` route with the `protect` middleware to ensure only the authenticated user can connect the account, verifying that `req.user._id` matches the `state` parameter, *OR*
- Sign the `state` parameter as a JWT containing the `userId` so it cannot be tampered with.

### 1.2 Unverified Webhooks (No Signature Validation)
**Location:** `webhooks/gmail.webhook.controller.js`
**Severity:** High
**Details:** The `/webhook/gmail` endpoint does not verify if the incoming POST request is genuinely from Google Pub/Sub.
**Exploit:** A malicious actor can continuously send HTTP POST requests with a forged payload containing a valid `emailAddress`. This will force the server to endlessly query the MongoDB database and call the Google Gmail API, leading to Rate Limiting from Google and potential Denial of Service (DoS) for the server.
**Recommendation:** Implement verification. Validate the ID token provided in the `Authorization` header by Google Pub/Sub, or use a secret token parameter in the webhook URL.

### 1.3 Missing Input Validation on Authentication
**Location:** `modules/auth/auth.controller.js`
**Severity:** Medium
**Details:** The `signup` controller does not parse, sanitize, or validate constraints on `email`, `name`, or `password`. 
**Exploit:** Users can set completely blank passwords, incorrectly formatted emails, or cause MongoDB to throw `500 Internal Server Error` (Unhandled Promise Rejection) if a duplicate email is entered, crashing the Node runtime if unhandled.
**Recommendation:** Use a validation library like `Joi` or `express-validator` to enforce email structure, password complexity, and graceful error handling on duplicate emails.

### 1.4 Crypto Module Startup Crash
**Location:** `utils/crypto.js`
**Severity:** Medium
**Details:** The encryption key is generated synchronously when the module loads: `crypto.createHash("sha256").update(process.env.EMAIL_ENCRYPTION_KEY)`. If `EMAIL_ENCRYPTION_KEY` is completely missing from `.env`, the `.update()` method will throw a `TypeError` and crash the application instantly on boot.
**Recommendation:** Validate that `process.env.EMAIL_ENCRYPTION_KEY` is present before attempting to hash it. Add a try/catch block for both encryption and decryption to handle maliciously/improperly formatted ciphertext that would otherwise crash the server.

---

## 2. Functional Bugs & Errors

### 2.1 Unhandled Promise Rejections (App Crashes)
**Location:** Across Controllers (`email.controller.js`, `connectedAccount.controller.js`, `user.controller.js`)
**Severity:** High
**Details:** Most controllers lack `try...catch` blocks or an async error wrapper (like `express-async-handler`). For example, in `email.controller.js`, if `decrypt(email.subject)` fails due to an invalid format, it throws a synchronous error, leaving the request hanging or crashing the server entirely.

### 2.2 Incorrect Email Body Extraction
**Location:** `webhooks/gmail.webhook.controller.js` (Lines ~108-109)
**Severity:** Medium
**Details:** The `fullMessage.data.snippet` is saved into both the `snippet` and `body` fields:
```javascript
snippet: encrypt(snippet),
body: encrypt(snippet),
```
The actual body of the email is located in the `payload.parts` or `payload.body` of the Gmail API response. Currently, the user will only ever see the short conversational snippet for the body of the email.

### 2.3 Invalid Date Parsing from AI output
**Location:** `webhooks/gmail.webhook.controller.js` (Line 123)
**Severity:** Medium
**Details:** The application relies on the LLM (Gemini) returning a date string in `aiResult.deadline`. If the AI hallucinates an unparseable date (e.g., "Next Friday"), `new Date(aiResult.deadline)` results in an `Invalid Date` object. Subsequent calls to `.getDate()` will return `NaN`, breaking the expiration logic completely.
**Recommendation:** Add validation `Number.isNaN(deadlineDate.getTime())` to verify if the parsed date is actually valid before assigning it.

### 2.4 Synchronous File Operations & File Bloat
**Location:** `modules/user/user.controller.js` (Line 30)
**Severity:** Low / Medium
**Details:** 
1. `fs.readFileSync(filePath)` blocks the Node.js event thread during resume uploads, halting all other requests while the file is read into memory.
2. The uploaded resume file (stored via `req.file.path`) is never deleted. Over time, the `uploads/` folder will grow indefinitely and run out of disk space.
3. The `mammoth` library is imported twice in the same controller.

---

## 3. Architecture & Code Quality Issues

1. **Hardcoded CORS:** `app.js` hardcodes `origin: "http://localhost:5174"`. This prevents proper usage in a deployed staging/production environment without manually altering the code.
2. **Empty Configuration Files:** `config/redis.js` is entirely empty. If Redis is meant to be used for queuing, it isn't set up.
3. **Inconsistent Secret Delivery:** `auth.controller.js`'s login explicitly issues `token` in the JSON response body AND as a secure `httpOnly` cookie. This makes it ambiguous for the frontend client on which authentication transport to rely on.
