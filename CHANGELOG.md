# Changelog

## 0.1.0

- Initial public package.
- `CocoMail` client with `emails.send` and `Resend` compatibility alias.
- SMTP relay and local sendmail delivery.
- Resend-shaped HTTP API: `POST /emails`, `GET /emails/:id`, `GET /emails`,
  `GET /health`.
- Bearer-token auth, allowed sender domains, in-memory rate limit, JSONL
  metadata log.
- `cocomail serve`, `cocomail send`, and `cocomail doctor`.
- DNS/Postfix/OpenDKIM documentation.
