# Changelog

## 0.2.0

- New `setup-page` renderer: self-contained DNS instruction page (copy buttons,
  copy-all, `.txt` download, verification commands).
- New `emailthecode setup` command. Auto-detects the domain, mail host, public
  IP, DKIM selector/key, SPF includes, and DMARC; supports provider-specific
  navigation notes, PTR guidance, extra A records, and IPv6.
- New `GET /setup` route: serves the same page from environment configuration;
  `?format=txt` returns the raw records. Public DNS data only, no secrets.
- Setup environment variables: `EMAILTHECODE_DOMAIN`, `_MAIL_HOST`,
  `_PUBLIC_IP`, `_IPV6`, `_DKIM_KEY[_FILE]`, `_SPF[_INCLUDE|_NOTE]`,
  `_DMARC[_NOTE]`, `_EXTRA_A`, `_PROVIDER[_STEPS]`, `_PTR_HOST/_PROVIDER`,
  `_PTR_SKIPPED`, `_SEND_ONLY`, `_SETUP_NOTE/_NOTES`, `_BRAND`.
- Tests cover the renderer, config parsing, and the public `/setup` route.

## 0.1.0

- Initial public package.
- `EmailTheCode` client with `emails.send` and `Resend` compatibility alias.
- SMTP relay and local sendmail delivery.
- Resend-shaped HTTP API: `POST /emails`, `GET /emails/:id`, `GET /emails`,
  `GET /health`.
- Bearer-token auth, allowed sender domains, in-memory rate limit, JSONL
  metadata log.
- `emailthecode serve`, `emailthecode send`, and `emailthecode doctor`.
- DNS/Postfix/OpenDKIM documentation.
