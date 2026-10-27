# CoCoMail

**Self-hosted, Resend-shaped transactional email for Node.js.**

CoCoMail is a small email SDK and HTTP API that sends through your own SMTP
relay or local `sendmail` binary. It keeps the developer experience of a hosted
email API while leaving delivery, logs, and infrastructure under your control.

- No vendor account required
- Resend-shaped `POST /emails` API
- SMTP relay or local Postfix/`sendmail` delivery
- Bearer-token HTTP API with JSONL send log
- CLI for `serve`, `send`, and DNS/SMTP `doctor`
- No tracking pixels, no remote templating, no vendor lock-in

## Install

```bash
npm install cocomail
```

Requires Node.js 18 or newer.

## Quick start

```js
const { CocoMail } = require('cocomail');

const mail = new CocoMail();

await mail.emails.send({
  from: 'Example App <noreply@example.com>',
  to: 'user@example.net',
  subject: 'Welcome',
  html: '<h1>Hello</h1><p>Thanks for signing up.</p>',
  text: 'Hello. Thanks for signing up.',
});
```

Use `Resend` as an alias when migrating existing code:

```js
const { Resend } = require('cocomail');
const mail = new Resend();
```

## Delivery modes

### 1. Local sendmail / Postfix

If no SMTP host is configured, CoCoMail invokes `/usr/sbin/sendmail` with the
message on stdin. This is the simplest setup on a server that already runs
Postfix:

```bash
sudo apt-get install postfix mailutils
```

### 2. SMTP relay

Set an SMTP host to use a local or remote relay:

```bash
COCOMAIL_SMTP_HOST=smtp.example.com
COCOMAIL_SMTP_PORT=587
COCOMAIL_SMTP_USER=mailer
COCOMAIL_SMTP_PASS=change-me
```

`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and `SMTP_PASS` are accepted as legacy
aliases.

## HTTP API

Run the server:

```bash
export COCOMAIL_API_KEY="$(openssl rand -hex 32)"
export COCOMAIL_ALLOWED_FROM_DOMAINS="example.com"
cocomail serve
```

Or via Docker:

```bash
docker build -t cocomail .
docker run --rm -p 3100:3100 \
  -e COCOMAIL_API_KEY=change-me \
  -e COCOMAIL_ALLOWED_FROM_DOMAINS=example.com \
  -e COCOMAIL_HOST=0.0.0.0 \
  -e COCOMAIL_LOG_FILE=/tmp/cocomail.jsonl \
  cocomail
```

Send a message:

```bash
curl -s http://127.0.0.1:3100/emails \
  -H "Authorization: Bearer $COCOMAIL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "Example App <noreply@example.com>",
    "to": "user@example.net",
    "subject": "Hello",
    "html": "<p>Hello from CoCoMail</p>",
    "text": "Hello from CoCoMail"
  }'
```

Response:

```json
{
  "id": "a1b2c3d4e5f6...",
  "queueId": "4D3A1B2C",
  "status": "queued"
}
```

Endpoints:

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Public health check |
| `POST` | `/emails` | Send an email |
| `GET` | `/emails/:id` | Look up a send-log entry |
| `GET` | `/emails?limit=50` | Recent sends |

All endpoints except `/health` require `Authorization: Bearer <COCOMAIL_API_KEY>`.

## CLI

```bash
# Start the HTTP API
cocomail serve

# Send a one-off test message
cocomail send \
  --from "Example <noreply@example.com>" \
  --to user@example.net \
  --subject "Test" \
  --text "Hello"

# Check SMTP, sendmail, and DNS records
cocomail doctor --domain example.com --selector cocomail
```

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `COCOMAIL_API_KEY` | required for `serve` | Bearer token |
| `COCOMAIL_HOST` | `127.0.0.1` | Bind host |
| `COCOMAIL_PORT` | `3100` | Bind port |
| `COCOMAIL_LOG_FILE` | `./cocomail.jsonl` | Metadata-only send log |
| `COCOMAIL_ALLOWED_FROM_DOMAINS` | empty (allow any) | Comma-separated sender domains |
| `COCOMAIL_RATE_LIMIT` | `120` | Requests/minute/IP |
| `COCOMAIL_SMTP_HOST` | unset | Use SMTP instead of sendmail |
| `COCOMAIL_SMTP_PORT` | `25` | SMTP port |
| `COCOMAIL_SMTP_USER` | unset | SMTP username |
| `COCOMAIL_SMTP_PASS` | unset | SMTP password |
| `COCOMAIL_SENDMAIL` | `/usr/sbin/sendmail` | sendmail path |

## DNS and deliverability

A sending domain needs SPF, DKIM, DMARC, and a matching PTR record. See
[`docs/DNS.md`](docs/DNS.md) and
[`docs/POSTFIX-OPENDKIM.md`](docs/POSTFIX-OPENDKIM.md) for copy-paste templates.

## Security notes

- The API binds to `127.0.0.1` by default. Put it behind a TLS reverse proxy if
  you expose it.
- Set `COCOMAIL_ALLOWED_FROM_DOMAINS` in production. An empty value allows any
  sender domain that can reach the API.
- The in-memory rate limiter is per process; use a shared limiter if you run
  multiple instances.
- The JSONL log stores metadata only (id, queue id, from, recipients, subject,
  status, timestamp), not message bodies.
- Never commit `.env` files, SMTP passwords, API keys, DKIM private keys, or
  seed phrases.

## Development

```bash
npm install
npm test
npm run pack:check
```

The test suite uses a custom transport and a temporary log file; it never sends
real email.

## License

MIT. See [`LICENSE`](LICENSE).
