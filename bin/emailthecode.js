#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const dns = require('node:dns').promises;
const { EmailTheCode } = require('../src');
const { startServer } = require('../src/server');
const { setupConfigFromEnv, renderSetupPage, renderSetupText, readDkimKeyFile } = require('../src/setup-page');
const pkg = require('../package.json');

function usage() {
  console.log(`EmailTheCode ${pkg.version}

Usage:
  emailthecode serve
  emailthecode send --from <address> --to <address[,address]> --subject <text> (--html <html> | --text <text>)
  emailthecode doctor [--domain example.com] [--selector emailthecode]
  emailthecode setup [--domain example.com --ip 203.0.113.10 --out dnsupdate.html]

Setup options:
  --domain <name>        Mail domain (or EMAILTHECODE_DOMAIN / EMAIL_FROM)
  --mail-host <name>     Mail hostname (default mail.<domain>)
  --ip <address>         Public IPv4 (or EMAILTHECODE_PUBLIC_IP; auto-detect fallback)
  --dkim-selector <name> DKIM selector (default emailthecode)
  --dkim-key-file <path> OpenDKIM public key file (default /etc/opendkim/keys/<domain>/<selector>.txt)
  --dkim-key <value>     DKIM public key value
  --spf-include <domain> Comma-separated SPF include domains (e.g. spf.resend.com)
  --spf <value>          Full SPF record (overrides --ip/--spf-include)
  --dmarc <value>        DMARC record (default "v=DMARC1; p=none;")
  --extra-a <host=ip>    Extra A record(s), comma-separated
  --brand <name>         Page brand (default EmailTheCode)
  --provider <name>      DNS provider name shown in the instructions
  --provider-steps <s>   Provider path, e.g. "Domain List → Manage → Advanced DNS"
  --spf-note <s>         Note shown under the SPF record
  --dmarc-note <s>       Note shown under the DMARC record
  --ipv6 <address>       Optional IPv6 address for the PTR note
  --ptr-host <name>      PTR target (default mail host)
  --ptr-provider <name>  Hosting provider for the PTR step
  --ptr-skipped          Mark PTR as optional/skipped
  --allow-mx             Do not show the send-only "do not change MX" warning
  --note <text>          Extra note on the page
  --notes <a|b|c>        Extra notes, pipe-separated
  --format <html|txt>    Output format (default html)
  --out <path>           Write to a file instead of stdout

Environment:
  EMAILTHECODE_API_KEY                 Bearer token for the HTTP API (required for serve)
  EMAILTHECODE_HOST                    Bind host (default 127.0.0.1)
  EMAILTHECODE_PORT                    Bind port (default 3100)
  EMAILTHECODE_LOG_FILE                JSONL send log (default ./emailthecode.jsonl)
  EMAILTHECODE_ALLOWED_FROM_DOMAINS    Comma-separated sender domains (optional)
  EMAILTHECODE_SMTP_HOST/PORT/USER/PASS  SMTP relay (optional)
  EMAILTHECODE_SENDMAIL                sendmail path (default /usr/sbin/sendmail)

Setup environment (used by the setup command and GET /setup):
  EMAILTHECODE_DOMAIN                  Mail domain (falls back to EMAIL_FROM)
  EMAILTHECODE_MAIL_HOST               Mail hostname (default mail.<domain>)
  EMAILTHECODE_PUBLIC_IP               Public IPv4 (auto-detected by the CLI if unset)
  EMAILTHECODE_IPV6                    Optional IPv6 address
  EMAILTHECODE_DKIM_SELECTOR           DKIM selector (default emailthecode)
  EMAILTHECODE_DKIM_KEY[_FILE]         DKIM public key value or file
  EMAILTHECODE_SPF[_INCLUDE|_NOTE]     SPF record or include domains / note
  EMAILTHECODE_DMARC[_NOTE]            DMARC record / note
  EMAILTHECODE_EXTRA_A                 Extra A records, "host=ip,host2="
  EMAILTHECODE_PROVIDER[_STEPS]        DNS provider name / navigation path
  EMAILTHECODE_PTR_HOST/_PROVIDER      PTR target / hosting provider
  EMAILTHECODE_PTR_SKIPPED             "true" marks PTR optional/skipped
  EMAILTHECODE_SEND_ONLY               "false" hides the do-not-change-MX warning
  EMAILTHECODE_SETUP_NOTE / _NOTES     Note / pipe-separated notes
  EMAILTHECODE_BRAND                   Page brand (default EmailTheCode)
`);
}

function takeFlag(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) return true;
  args.splice(index, 2);
  return value;
}

async function send(args) {
  const from = takeFlag(args, '--from');
  const to = takeFlag(args, '--to');
  const subject = takeFlag(args, '--subject');
  const html = takeFlag(args, '--html');
  const text = takeFlag(args, '--text');
  const replyTo = takeFlag(args, '--reply-to');
  if (!from || !to || !subject || (!html && !text)) {
    usage();
    process.exitCode = 2;
    return;
  }
  const mailer = new EmailTheCode();
  const result = await mailer.emails.send({
    from,
    to: String(to).split(',').map((value) => value.trim()).filter(Boolean),
    subject,
    html: html && html !== true ? html : undefined,
    text: text && text !== true ? text : undefined,
    replyTo: replyTo && replyTo !== true ? replyTo : undefined,
  });
  console.log(JSON.stringify(result, null, 2));
}

async function doctor(args) {
  const domain = takeFlag(args, '--domain');
  const selector = takeFlag(args, '--selector') || 'emailthecode';
  const smtpHost = process.env.EMAILTHECODE_SMTP_HOST || process.env.SMTP_HOST;
  const smtpPort = process.env.EMAILTHECODE_SMTP_PORT || process.env.SMTP_PORT || '25';
  const sendmail = process.env.EMAILTHECODE_SENDMAIL || '/usr/sbin/sendmail';
  console.log('EmailTheCode ' + pkg.version);
  console.log('Node ' + process.version);
  console.log('API key configured: ' + Boolean(process.env.EMAILTHECODE_API_KEY || process.env.MAIL_API_KEY));
  console.log('Allowed from domains: ' + (process.env.EMAILTHECODE_ALLOWED_FROM_DOMAINS || '(any)'));
  console.log('SMTP: ' + (smtpHost ? smtpHost + ':' + smtpPort : '(not configured; sendmail fallback)'));
  console.log('sendmail exists: ' + fs.existsSync(sendmail) + ' (' + sendmail + ')');

  if (smtpHost) {
    try {
      const nodemailer = require('nodemailer');
      const transport = nodemailer.createTransport({
        host: smtpHost,
        port: Number(smtpPort),
        secure: Number(smtpPort) === 465,
        ignoreTLS: smtpHost === '127.0.0.1' || smtpHost === 'localhost',
      });
      await transport.verify();
      console.log('SMTP verify: OK');
    } catch (err) {
      console.log('SMTP verify: FAIL — ' + err.message);
    }
  }

  if (domain && domain !== true) {
    const checks = [
      ['SPF', domain],
      ['DMARC', '_dmarc.' + domain],
      ['DKIM', selector + '._domainkey.' + domain],
    ];
    for (const [label, name] of checks) {
      try {
        const records = await dns.resolveTxt(name);
        const value = records.map((parts) => parts.join('')).join(' ');
        console.log(label + ': ' + (value || '(empty)'));
      } catch (err) {
        console.log(label + ': MISSING (' + err.code + ')');
      }
    }
  }
}

async function detectPublicIp() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return '';
    const body = await res.json();
    return String(body.ip || '').trim();
  } catch {
    return '';
  }
}

function flagValue(args, name) {
  const value = takeFlag(args, name);
  if (value === null) return '';
  return value === true ? '' : String(value);
}

async function setup(args) {
  const cfg = setupConfigFromEnv(process.env);
  const domain = flagValue(args, '--domain');
  const mailHost = flagValue(args, '--mail-host');
  const ip = flagValue(args, '--ip');
  const selector = flagValue(args, '--dkim-selector');
  const keyFile = flagValue(args, '--dkim-key-file');
  const key = flagValue(args, '--dkim-key');
  const spfInclude = flagValue(args, '--spf-include');
  const spfRaw = flagValue(args, '--spf');
  const dmarc = flagValue(args, '--dmarc');
  const extraA = flagValue(args, '--extra-a');
  const brand = flagValue(args, '--brand');
  const note = flagValue(args, '--note');
  const notes = flagValue(args, '--notes');
  const ptrHost = flagValue(args, '--ptr-host');
  const ptrProvider = flagValue(args, '--ptr-provider');
  const provider = flagValue(args, '--provider');
  const providerSteps = flagValue(args, '--provider-steps');
  const spfNote = flagValue(args, '--spf-note');
  const dmarcNote = flagValue(args, '--dmarc-note');
  const ipv6 = flagValue(args, '--ipv6');
  const format = flagValue(args, '--format') || 'html';
  const out = flagValue(args, '--out');

  if (domain) cfg.domain = domain.toLowerCase();
  if (!cfg.domain) {
    console.error('emailthecode setup: --domain is required (or set EMAILTHECODE_DOMAIN / EMAIL_FROM)');
    process.exitCode = 2;
    return;
  }
  if (mailHost) cfg.mailHost = mailHost;
  if (!cfg.mailHost) cfg.mailHost = 'mail.' + cfg.domain;
  if (ip) cfg.ip = ip;
  if (!cfg.ip) {
    process.stderr.write('emailthecode setup: detecting public IP…\n');
    cfg.ip = await detectPublicIp();
  }
  if (selector) cfg.dkimSelector = selector;
  if (keyFile) cfg.dkimKey = readDkimKeyFile(keyFile);
  if (key) cfg.dkimKey = key;
  if (!cfg.dkimKey && cfg.domain) {
    cfg.dkimKey = readDkimKeyFile(path.join('/etc/opendkim/keys', cfg.domain, cfg.dkimSelector + '.txt'));
  }
  if (spfRaw) {
    cfg.spf = spfRaw;
  } else if (ip || spfInclude) {
    const includes = spfInclude
      ? spfInclude.split(',').map((v) => v.trim()).filter(Boolean)
      : (cfg.spf.match(/include:(\S+)/g) || []).map((m) => m.slice('include:'.length));
    cfg.spf = 'v=spf1' + (cfg.ip ? ' ip4:' + cfg.ip : '')
      + includes.map((v) => ' include:' + v).join('')
      + ' ~all';
  }
  if (dmarc) cfg.dmarc = dmarc;
  if (extraA) {
    cfg.extraA = extraA.split(',').map((item) => {
      const idx = item.indexOf('=');
      return idx < 0 ? { host: item.trim(), value: '' } : { host: item.slice(0, idx).trim(), value: item.slice(idx + 1).trim() };
    }).filter((r) => r.host);
  }
  if (brand) cfg.brand = brand;
  if (note) cfg.note = note;
  if (notes) cfg.notes = notes.split('|').map((v) => v.trim()).filter(Boolean);
  if (ptrHost) cfg.ptrHost = ptrHost;
  if (ptrProvider) cfg.ptrProvider = ptrProvider;
  if (provider) cfg.provider = provider;
  if (providerSteps) cfg.providerSteps = providerSteps;
  if (spfNote) cfg.spfNote = spfNote;
  if (dmarcNote) cfg.dmarcNote = dmarcNote;
  if (ipv6) cfg.ipv6 = ipv6;
  if (args.includes('--ptr-skipped')) cfg.ptrSkipped = true;
  if (args.includes('--allow-mx')) cfg.sendOnly = false;

  if (!cfg.ip) {
    process.stderr.write('emailthecode setup: could not detect a public IP; pass --ip\n');
  }
  if (!cfg.dkimKey) {
    process.stderr.write('emailthecode setup: no DKIM key found; pass --dkim-key-file or --dkim-key\n');
  }

  const output = format === 'txt' ? renderSetupText(cfg) : renderSetupPage(cfg);
  if (out) {
    fs.writeFileSync(out, output);
    process.stderr.write('emailthecode: wrote ' + out + '\n');
  } else {
    process.stdout.write(output);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args.shift();
  if (!command || command === '-h' || command === '--help' || command === 'help') {
    usage();
    return;
  }
  if (command === 'setup') return setup(args);
  if (command === 'serve') {
    const { server } = startServer();
    const shutdown = () => server.close(() => process.exit(0));
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    return;
  }
  if (command === 'send') return send(args);
  if (command === 'doctor') return doctor(args);
  usage();
  process.exitCode = 2;
}

main().catch((err) => {
  console.error('emailthecode:', err.message);
  process.exit(1);
});
