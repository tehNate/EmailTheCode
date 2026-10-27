# Setup page / `emailthecode setup`

EmailTheCode can generate the DNS instructions for a sending domain. The output
is a single self-contained HTML page (or plain text) with the exact records to
add, copy buttons, a copy-all block, a `.txt` download, and verification
commands. It contains only public DNS data — no keys, tokens, or private
material.

## CLI

```bash
emailthecode setup --domain example.com --out dnsupdate.html
```

With no flags it reads the environment (below), detects the public IPv4 from
`api.ipify.org`, and reads the OpenDKIM public key from
`/etc/opendkim/keys/<domain>/<selector>.txt`.

### Options

| Flag | Meaning |
|---|---|
| `--domain <name>` | Mail domain (or `EMAILTHECODE_DOMAIN` / `EMAIL_FROM`) |
| `--mail-host <name>` | Mail hostname (default `mail.<domain>`) |
| `--ip <address>` | Public IPv4 (or `EMAILTHECODE_PUBLIC_IP`; auto-detect fallback) |
| `--ipv6 <address>` | Optional IPv6 address shown in the PTR note |
| `--dkim-selector <name>` | DKIM selector (default `emailthecode`) |
| `--dkim-key-file <path>` | OpenDKIM public key file |
| `--dkim-key <value>` | DKIM public key value (overrides the file) |
| `--spf <value>` | Full SPF record (overrides `--ip` / `--spf-include`) |
| `--spf-include <domains>` | Comma-separated SPF include domains |
| `--spf-note <text>` | Note shown under the SPF record |
| `--dmarc <value>` | DMARC record (default `v=DMARC1; p=none;`) |
| `--dmarc-note <text>` | Note shown under the DMARC record |
| `--extra-a <host=ip>` | Extra A record(s), comma-separated (`batch=` reuses the mail IP) |
| `--brand <name>` | Page brand (default `EmailTheCode`) |
| `--provider <name>` | DNS provider name shown in the instructions |
| `--provider-steps <text>` | Provider navigation path |
| `--ptr-host <name>` | PTR target (default the mail host) |
| `--ptr-provider <name>` | Hosting provider for the PTR step |
| `--ptr-skipped` | Mark PTR optional/skipped |
| `--allow-mx` | Hide the send-only "do not change MX" warning |
| `--note <text>` | A note shown above the extra notes |
| `--notes <a\|b\|c>` | Extra notes, pipe-separated |
| `--format <html\|txt>` | Output format (default `html`) |
| `--out <path>` | Write to a file instead of stdout |

### Examples

```bash
# Minimal
emailthecode setup --domain example.com

# Self-hosted Postfix + OpenDKIM with a provider walkthrough
emailthecode setup \
  --domain example.com \
  --ip 203.0.113.10 \
  --dkim-selector mail \
  --provider Namecheap \
  --provider-steps 'Domain List → example.com → Manage → Advanced DNS' \
  --spf-include spf.resend.com \
  --ptr-provider 'Hetzner Cloud' \
  --extra-a 'batch=' \
  --out dnsupdate.html

# Plain text / CI
emailthecode setup --domain example.com --format txt > dns.txt
```

## HTTP route

`GET /setup` serves the page rendered from the server environment:

```bash
curl -s http://127.0.0.1:3100/setup
curl -s 'http://127.0.0.1:3100/setup?format=txt'
```

The route is public (it is public DNS data) and sends
`Cache-Control: no-store`.

## Environment

| Variable | Purpose |
|---|---|
| `EMAILTHECODE_DOMAIN` | Mail domain (falls back to the domain in `EMAIL_FROM`) |
| `EMAILTHECODE_MAIL_HOST` | Mail hostname |
| `EMAILTHECODE_PUBLIC_IP` | Public IPv4 for the A record and SPF |
| `EMAILTHECODE_IPV6` | Optional IPv6 address |
| `EMAILTHECODE_DKIM_SELECTOR` | DKIM selector |
| `EMAILTHECODE_DKIM_KEY` / `_FILE` | DKIM public key value or file |
| `EMAILTHECODE_SPF` / `_INCLUDE` / `_NOTE` | SPF record, include list, note |
| `EMAILTHECODE_DMARC` / `_NOTE` | DMARC record and note |
| `EMAILTHECODE_EXTRA_A` | Extra A records (`host=ip,host2=`) |
| `EMAILTHECODE_PROVIDER` / `_STEPS` | DNS provider name and navigation path |
| `EMAILTHECODE_PTR_HOST` / `_PROVIDER` | PTR target and hosting provider |
| `EMAILTHECODE_PTR_SKIPPED` | `true` marks PTR optional/skipped |
| `EMAILTHECODE_SEND_ONLY` | `false` hides the do-not-change-MX warning |
| `EMAILTHECODE_SETUP_NOTE` / `_NOTES` | Note / pipe-separated notes |
| `EMAILTHECODE_BRAND` | Page brand |

## Safety

- Keep exactly one SPF record at the apex. The page says so explicitly.
- Do not add an MX record for the mail host on a send-only server.
- PTR is set at the hosting provider, not the DNS provider.
- The page is marked `noindex,nofollow`; delete it after setup if you prefer.

## Tests

```bash
npm test
node bin/emailthecode.js setup --domain example.com --format txt
```
