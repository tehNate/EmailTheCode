# DNS setup for CoCoMail

These records assume:

- sending domain: `example.com`
- mail hostname: `mail.example.com`
- server IPv4: `192.0.2.10` (documentation range; replace with your server)
- DKIM selector: `cocomail`

Do not copy the documentation IP or domain into production.

## 1. A record for the mail hostname

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `mail.example.com` | `192.0.2.10` | 300 |

The SMTP banner, HELO name, and PTR should all use `mail.example.com`.

## 2. SPF

Edit the existing TXT record at the domain root; do not create a second SPF
record.

```text
v=spf1 ip4:192.0.2.10 ~all
```

Use `-all` only after every legitimate sender is listed. If you send through a
relay as well, add its `include:` mechanism.

## 3. DKIM

Generate a 2048-bit key on the mail server, then publish the public key:

```text
cocomail._domainkey.example.com.  TXT  "v=DKIM1; h=sha256; k=rsa; p=..."
```

Keep the private key on the mail server, readable only by the signing service.
The exact value comes from `opendkim-genkey` / `opendkim-tools`.

## 4. DMARC

Start in monitoring mode:

```text
_dmarc.example.com.  TXT  "v=DMARC1; p=none; rua=mailto:dmarc@example.com"
```

Move to `p=quarantine` and then `p=reject` after reviewing reports.

## 5. PTR / reverse DNS

Set this at the hosting provider, not the DNS provider:

```text
192.0.2.10 -> mail.example.com
```

A mismatched or generic PTR is a common reason for spam placement.

## 6. Verify

```bash
cocomail doctor --domain example.com --selector cocomail
```

Expected: SPF, DMARC, and DKIM records are present, SMTP verifies if configured,
and a test message passes SPF/DKIM/DMARC at the receiving mailbox.

## Notes

- Keep `mail.example.com` A and PTR matching.
- Do not expose port 25 inbound unless you intend to receive mail.
- A new IP needs reputation warm-up; start with low volume and monitor
  bounces/complaints.
