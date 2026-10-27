# Security Policy

## Supported versions

Security fixes are provided for the latest published minor release.

## Reporting a vulnerability

Please do not open a public issue for a security vulnerability.

Use GitHub's private **Report a vulnerability** flow on the repository's
Security tab. Include:

- the affected version or commit;
- a minimal reproduction;
- the impact you believe is possible;
- any suggested mitigation.

Do not include real API keys, SMTP passwords, private DKIM keys, or personal
data in the report. Use placeholders and redact sensitive values.

## Operational guidance

- Keep `COCOMAIL_API_KEY` secret and rotate it if exposed.
- Bind the HTTP API to localhost and terminate TLS at a reverse proxy.
- Set `COCOMAIL_ALLOWED_FROM_DOMAINS` to the domains your deployment may send as.
- Run the service as a non-root user.
- Never commit `.env` files or credentials.
