# Postfix + OpenDKIM on a single host

This is a minimal outbound setup. Replace `example.com`, `mail.example.com`, and
`192.0.2.10` with your own values. Keep private keys off the public repository.

## Install

```bash
sudo apt-get update
sudo apt-get install -y postfix mailutils opendkim opendkim-tools
```

Choose “Internet Site” and set the system mail name to `mail.example.com`.

## Postfix

`/etc/postfix/main.cf`:

```text
myhostname = mail.example.com
mydomain = example.com
myorigin = $myhostname
inet_interfaces = loopback-only
mydestination = $myhostname, localhost.localdomain, localhost
milter_default_action = accept
milter_protocol = 6
smtpd_milters = inet:127.0.0.1:8891
non_smtpd_milters = inet:127.0.0.1:8891
smtp_tls_security_level = may
smtp_tls_CApath = /etc/ssl/certs
```

For an IPv4-only host, optionally bind outbound SMTP explicitly:

```text
smtp_bind_address = 192.0.2.10
```

Restart:

```bash
sudo systemctl restart postfix
```

## OpenDKIM

Create the key:

```bash
sudo mkdir -p /etc/opendkim/keys/example.com
sudo opendkim-genkey -D /etc/opendkim/keys/example.com -d example.com -s emailthecode
sudo chown -R opendkim:opendkim /etc/opendkim
```

`/etc/opendkim/key.table`:

```text
emailthecode example.com:emailthecode:/etc/opendkim/keys/example.com/emailthecode.private
```

`/etc/opendkim/signing.table`:

```text
*@example.com emailthecode
```

`/etc/opendkim.conf` essentials:

```text
Socket inet:8891@localhost
Mode sv
SubDomains no
Canonicalization relaxed/simple
OversignHeaders From
UserID opendkim
UMask 007
KeyTable refile:/etc/opendkim/key.table
SigningTable refile:/etc/opendkim/signing.table
```

Publish the TXT record from
`/etc/opendkim/keys/example.com/emailthecode.txt`, then:

```bash
sudo systemctl restart opendkim postfix
sudo opendkim-testkey -d example.com -s emailthecode -vvv
```

## EmailTheCode

```bash
export EMAILTHECODE_API_KEY="$(openssl rand -hex 32)"
export EMAILTHECODE_ALLOWED_FROM_DOMAINS="example.com"
emailthecode serve
```

Or point EmailTheCode at a relay:

```bash
export EMAILTHECODE_SMTP_HOST=127.0.0.1
export EMAILTHECODE_SMTP_PORT=25
```

## Test

```bash
emailthecode send \
  --from "Example <noreply@example.com>" \
  --to your-test-mailbox@example.net \
  --subject "EmailTheCode test" \
  --text "Hello from EmailTheCode"
```

Check the received headers for `spf=pass`, `dkim=pass`, and `dmarc=pass`.
