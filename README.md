# EmailTheCode

**Self-hosted, Resend-shaped transactional email for Node.js.**

EmailTheCode is a small email SDK and HTTP API that sends through your own SMTP
relay or local `sendmail` binary. It keeps the developer experience of a hosted
email API while leaving delivery, logs, and infrastructure under your control.

- No vendor account required
- Resend-shaped `POST /emails` API
- SMTP relay or local Postfix/`sendmail` delivery
- Bearer-token HTTP API with JSONL send log
- CLI for `serve`, `send`, and DNS/SMTP `doctor`
- No tracking pixels, no remote templating, no vendor lock-in

## Install

Latest (0.2.0, GitHub release):

```bash
npm install https://github.com/tehNate/EmailTheCode/releases/download/v0.2.0/emailthecode-0.2.0.tgz
```

Or from the tag:

```bash
npm install github:tehNate/EmailTheCode#v0.2.0
```

The npm registry currently has **0.1.0** (`npm install emailthecode`); the
0.2.0 npm publish is on hold. Requires Node.js 18 or newer.

## Quick start

```js
const { EmailTheCode } = require('emailthecode');

const mail = new EmailTheCode();

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
const { Resend } = require('emailthecode');
const mail = new Resend();
```

## Delivery modes

### 1. Local sendmail / Postfix

If no SMTP host is configured, EmailTheCode invokes `/usr/sbin/sendmail` with the
message on stdin. This is the simplest setup on a server that already runs
Postfix:

```bash
sudo apt-get install postfix mailutils
```

### 2. SMTP relay

Set an SMTP host to use a local or remote relay:

```bash
EMAILTHECODE_SMTP_HOST=smtp.example.com
EMAILTHECODE_SMTP_PORT=587
EMAILTHECODE_SMTP_USER=mailer
EMAILTHECODE_SMTP_PASS=change-me
```

`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and `SMTP_PASS` are accepted as legacy
aliases.

## HTTP API

Run the server:

```bash
export EMAILTHECODE_API_KEY="$(openssl rand -hex 32)"
export EMAILTHECODE_ALLOWED_FROM_DOMAINS="example.com"
emailthecode serve
```

Or via Docker:

```bash
docker build -t emailthecode .
docker run --rm -p 3100:3100 \
  -e EMAILTHECODE_API_KEY=change-me \
  -e EMAILTHECODE_ALLOWED_FROM_DOMAINS=example.com \
  -e EMAILTHECODE_HOST=0.0.0.0 \
  -e EMAILTHECODE_LOG_FILE=/tmp/emailthecode.jsonl \
  emailthecode
```

Send a message:

```bash
curl -s http://127.0.0.1:3100/emails \
  -H "Authorization: Bearer $EMAILTHECODE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "Example App <noreply@example.com>",
    "to": "user@example.net",
    "subject": "Hello",
    "html": "<p>Hello from EmailTheCode</p>",
    "text": "Hello from EmailTheCode"
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

All endpoints except `/health` require `Authorization: Bearer <EMAILTHECODE_API_KEY>`.

## CLI

```bash
# Start the HTTP API
emailthecode serve

# Send a one-off test message
emailthecode send \
  --from "Example <noreply@example.com>" \
  --to user@example.net \
  --subject "Test" \
  --text "Hello"

# Check SMTP, sendmail, and DNS records
emailthecode doctor --domain example.com --selector emailthecode

# Generate a ready-to-send DNS instruction page from your live config
emailthecode setup --domain example.com --out dnsupdate.html
```

`emailthecode setup` auto-detects the mail host, public IP, DKIM key, SPF
includes, and DMARC policy. The generated page is self-contained (copy buttons,
copy-all, `.txt` download, verification commands) and contains only public DNS
data. The same page is served by the API at `GET /setup` (and
`GET /setup?format=txt`), populated from the environment.

```bash
# Serve the setup page from the running API
curl -s http://127.0.0.1:3100/setup | less
curl -s 'http://127.0.0.1:3100/setup?format=txt'
```

See [`docs/SETUP.md`](docs/SETUP.md) for every option and environment variable.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `EMAILTHECODE_API_KEY` | required for `serve` | Bearer token |
| `EMAILTHECODE_HOST` | `127.0.0.1` | Bind host |
| `EMAILTHECODE_PORT` | `3100` | Bind port |
| `EMAILTHECODE_LOG_FILE` | `./emailthecode.jsonl` | Metadata-only send log |
| `EMAILTHECODE_ALLOWED_FROM_DOMAINS` | empty (allow any) | Comma-separated sender domains |
| `EMAILTHECODE_RATE_LIMIT` | `120` | Requests/minute/IP |
| `EMAILTHECODE_SMTP_HOST` | unset | Use SMTP instead of sendmail |
| `EMAILTHECODE_SMTP_PORT` | `25` | SMTP port |
| `EMAILTHECODE_SMTP_USER` | unset | SMTP username |
| `EMAILTHECODE_SMTP_PASS` | unset | SMTP password |
| `EMAILTHECODE_SENDMAIL` | `/usr/sbin/sendmail` | sendmail path |

## DNS and deliverability

A sending domain needs SPF, DKIM, DMARC, and a matching PTR record. See
[`docs/DNS.md`](docs/DNS.md) and
[`docs/POSTFIX-OPENDKIM.md`](docs/POSTFIX-OPENDKIM.md) for copy-paste templates.

## Security notes

- The API binds to `127.0.0.1` by default. Put it behind a TLS reverse proxy if
  you expose it.
- Set `EMAILTHECODE_ALLOWED_FROM_DOMAINS` in production. An empty value allows any
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

GNU General Public License v3.0 only. See [`LICENSE`](LICENSE).
