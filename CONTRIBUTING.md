# Contributing to EmailTheCode

Thanks for helping improve EmailTheCode.

## Development setup

```bash
npm install
npm test
```

The tests use a mock transport and never send real email.

## Pull requests

- Keep changes focused and include tests where behaviour changes.
- Do not add real domains, IP addresses, API keys, SMTP credentials, DKIM
  private keys, email addresses, or other personal data to the repository.
  Use `example.com`, `example.net`, and the RFC 5737 `192.0.2.0/24` range in
  examples.
- Update the README or docs when configuration or API behaviour changes.
- Run `npm test` and `npm run pack:check` before opening a PR.

## Reporting security issues

See [SECURITY.md](SECURITY.md). Do not open public issues for vulnerabilities.
