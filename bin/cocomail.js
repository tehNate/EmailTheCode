#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const dns = require('node:dns').promises;
const { CocoMail } = require('../src');
const { startServer } = require('../src/server');
const pkg = require('../package.json');

function usage() {
  console.log(`CoCoMail ${pkg.version}

Usage:
  cocomail serve
  cocomail send --from <address> --to <address[,address]> --subject <text> (--html <html> | --text <text>)
  cocomail doctor [--domain example.com] [--selector cocomail]

Environment:
  COCOMAIL_API_KEY                 Bearer token for the HTTP API (required for serve)
  COCOMAIL_HOST                    Bind host (default 127.0.0.1)
  COCOMAIL_PORT                    Bind port (default 3100)
  COCOMAIL_LOG_FILE                JSONL send log (default ./cocomail.jsonl)
  COCOMAIL_ALLOWED_FROM_DOMAINS    Comma-separated sender domains (optional)
  COCOMAIL_SMTP_HOST/PORT/USER/PASS  SMTP relay (optional)
  COCOMAIL_SENDMAIL                sendmail path (default /usr/sbin/sendmail)
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
  const mailer = new CocoMail();
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
  const selector = takeFlag(args, '--selector') || 'cocomail';
  const smtpHost = process.env.COCOMAIL_SMTP_HOST || process.env.SMTP_HOST;
  const smtpPort = process.env.COCOMAIL_SMTP_PORT || process.env.SMTP_PORT || '25';
  const sendmail = process.env.COCOMAIL_SENDMAIL || '/usr/sbin/sendmail';
  console.log('CoCoMail ' + pkg.version);
  console.log('Node ' + process.version);
  console.log('API key configured: ' + Boolean(process.env.COCOMAIL_API_KEY || process.env.MAIL_API_KEY));
  console.log('Allowed from domains: ' + (process.env.COCOMAIL_ALLOWED_FROM_DOMAINS || '(any)'));
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

async function main() {
  const args = process.argv.slice(2);
  const command = args.shift();
  if (!command || command === '-h' || command === '--help' || command === 'help') {
    usage();
    return;
  }
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
  console.error('cocomail:', err.message);
  process.exit(1);
});
