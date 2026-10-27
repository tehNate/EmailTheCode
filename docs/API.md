# EmailTheCode HTTP API

Base URL example: `http://127.0.0.1:3100`

All endpoints except `GET /health` require:

```http
Authorization: Bearer <EMAILTHECODE_API_KEY>
```

## `GET /health`

Public. Returns:

```json
{ "status": "ok", "service": "emailthecode", "time": "2026-01-01T00:00:00.000Z" }
```

## `POST /emails`

Request:

```json
{
  "from": "Example App <noreply@example.com>",
  "to": "user@example.net",
  "subject": "Welcome",
  "html": "<p>Hello</p>",
  "text": "Hello",
  "reply_to": "support@example.com",
  "headers": { "X-Campaign": "welcome" }
}
```

`to` may be a single address or an array of up to 50 addresses. `html` or `text`
is required. `reply_to` and `replyTo` are accepted.

Success: `200`

```json
{
  "id": "a1b2c3d4e5f6...",
  "queueId": "4D3A1B2C",
  "status": "queued"
}
```

Errors are JSON:

```json
{ "error": "from, to, subject, and html or text are required" }
```

Status codes:

- `400` invalid input or disallowed sender domain
- `401` missing/invalid bearer token
- `429` rate limit exceeded
- `502` delivery could not be queued

## `GET /emails/:id`

Returns the metadata-only send-log entry for an `id` (or a `queueId`).

```json
{
  "id": "a1b2c3d4e5f6...",
  "queueId": "4D3A1B2C",
  "from": "Example App <noreply@example.com>",
  "to": ["user@example.net"],
  "subject": "Welcome",
  "status": "queued",
  "ts": "2026-01-01T00:00:00.000Z"
}
```

## `GET /emails?limit=50`

Returns recent log entries, newest first. `limit` is capped at 500.

## Notes

- The log is a local JSONL file. It is not a durable queue or delivery webhook.
- `queueId` is whatever the SMTP server or sendmail reports; it may be `null`.
- The server does not store message bodies.
