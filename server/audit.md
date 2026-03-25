# Gmail Webhook Audit

## Webhook Route

```
POST /webhook/gmail
```

Registered in `app.js` → `webhooks/gmail.webhook.js` → `gmail.webhook.controller.js`

---

## How It Works

1. Google Cloud Pub/Sub pushes a notification when a new email arrives in a watched Gmail inbox.
2. The server decodes the base64 Pub/Sub message to get `{ emailAddress, historyId }`.
3. Looks up the `ConnectedAccount` by `emailAddress`.
4. Calls `refreshGoogleTokenIfNeeded()` — auto-refreshes the OAuth access token if expired.
5. Calls Gmail History API with `startHistoryId: account.lastHistoryId` to get only new messages.
6. For each new INBOX message: extracts `subject`, `from`, `snippet`, `body` (MIME decoded).
7. **Classifies the email first** using Gemini AI (`gemini-2.5-flash`).
8. Routes the email to the correct MongoDB schema based on category.
9. Stores encrypted fields (subject, snippet, body) using AES-256-CBC.
10. Updates `account.lastHistoryId` to the new value.

---

## Issues Found & Fixed

### Issue 1 — Email stored before AI classification (FIXED)
**Previous behaviour:** Email was stored with no category, then AI ran, then a separate `updateOne()` patched it.
**Problem:** If AI failed after storage, the document had no category and was stuck in the DB with `aiProcessed: false`.
**Fix:** AI classification now runs **first**. If classification fails, nothing is stored. This avoids orphaned documents.

---

### Issue 2 — `lastHistoryId` missing on first webhook call (FIXED)
**Previous behaviour:** No guard check — if `account.lastHistoryId` was `undefined`, the Gmail History API call would throw `400 Bad Request: historyId is required`.
**When it happens:** If the `watch()` response during Gmail connection didn't save `lastHistoryId` properly (e.g. network failure mid-save), subsequent webhook calls would crash inside `fetchNewEmails`.
**Fix:** Added guard at the top of `fetchNewEmails`:
```js
if (!account.lastHistoryId) {
  account.lastHistoryId = newHistoryId;
  await account.save();
  return;
}
```

---

### Issue 3 — `msg.labelIds` not null-checked (FIXED)
**Previous behaviour:** `msg.labelIds.includes("INBOX")` would throw `TypeError: Cannot read properties of undefined` if Gmail omitted `labelIds` on the message stub in the history record.
**Fix:** Added null check: `if (!msg.labelIds || !msg.labelIds.includes("INBOX")) continue;`

---

### Issue 4 — Single `Email` model caused mixed-category queries (FIXED)
**Previous behaviour:** All email types (job, internship, interview, offer letter, etc.) were stored in one collection with a `category` field.
**Problem:** No per-type TTL, no type-specific indexing, harder to query by intent.
**Fix:** Replaced with 4 dedicated schemas, each with their own TTL index:

| Schema | Collection | Covers |
|---|---|---|
| `RegistrationEmail` | `registrationemails` | job, internship, hackathon, workshop, registration |
| `RegisteredEmail` | `registeredemails` | registration confirmed / application received |
| `InProgressEmail` | `inprogressemails` | interview, HR round, any selection round |
| `ConfirmedEmail` | `confirmedemails` | offer letters, congratulations, onboarding |

---

### Issue 5 — `other` category emails were stored (FIXED)
**Previous behaviour:** Emails classified as `other` were stored in the DB with no useful metadata.
**Fix:** `other` category emails are now skipped entirely — `getModelForCategory()` returns `null` and the message is skipped with a log.

---

## TTL — Auto-Deletion After 3 Months

All 4 schemas have:
```js
expiresAt: { type: Date, required: true }
// index:
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
```

`expiresAt` is set to `Date.now() + 90 days` at insert time.
MongoDB's TTL monitor (runs every ~60 seconds) deletes documents automatically once `expiresAt` is past.

---

## Environment Variables Required for Webhook

| Variable | Description |
|---|---|
| `GOOGLE_PUBSUB_TOPIC` | Pub/Sub topic name used in `gmail.users.watch()` |
| `WEBHOOK_SECRET` | Optional token validated on `?token=` query param |
| `EMAIL_ENCRYPTION_KEY` | AES-256 key for encrypting stored email fields |
| `GEMINI_API_KEY` | Google Gemini API key for email classification |

---

## Known Limitations

- **Microsoft/Outlook webhook** — `ConnectedAccount` schema has `subscriptionId` / `subscriptionExpiry` fields but the Outlook webhook handler is not yet implemented. Only Gmail Pub/Sub is active.
- **Pub/Sub subscription renewal** — Gmail `watch()` subscriptions expire after 7 days and must be renewed. There is no cron job yet to auto-renew them (note: `node-cron` is in dependencies but not wired).
- **Webhook always returns 200** — intentional (Pub/Sub requires 200 to ack; non-200 causes retry storms). Errors are logged to console only.
