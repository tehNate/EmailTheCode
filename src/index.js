'use strict';

const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');

const DEFAULT_SENDMAIL = '/usr/sbin/sendmail';
const MAX_RECIPIENTS = 50;

function stripHtml(html) {
  return String(html || '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function bareAddress(value) {
  const s = String(value || '').trim();
  const m = s.match(/<([^>]+)>/);
  const addr = (m ? m[1] : s).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
    throw new Error('Invalid email address: ' + s);
  }
  return addr;
}

function domainOf(value) {
  return bareAddress(value).split('@')[1].toLowerCase();
}

function displayName(value) {
  const s = String(value || '').trim();
  const m = s.match(/^([^<]+)</);
  return m ? m[1].trim().replace(/^"|"$/g, '') : '';
}

function cleanHeader(value) {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim();
}

function cleanCustomHeaders(headers) {
  if (!headers || typeof headers !== 'object') return [];
  const out = [];
  for (const [rawName, rawValue] of Object.entries(headers)) {
    const name = String(rawName || '').trim();
    if (!/^[A-Za-z0-9-]+$/.test(name)) continue;
    // Do not allow callers to override the structural headers we generate.
    if (/^(from|to|subject|date|message-id|mime-version|content-type|content-transfer-encoding)$/i.test(name)) continue;
    out.push([name, cleanHeader(rawValue)]);
  }
  return out;
}

function buildMimeMessage({ from, to, subject, html, text, replyTo, headers }) {
  const boundary = '----=_Part_' + crypto.randomBytes(16).toString('hex');
  const messageId = '<' + crypto.randomBytes(16).toString('hex') + '@' + domainOf(from) + '>';
  const recipients = Array.isArray(to) ? to.join(', ') : String(to);
  const plainText = text || stripHtml(html);
  const hasHtml = Boolean(html);

  let msg = '';
  msg += 'From: ' + cleanHeader(from) + '\r\n';
  if (replyTo) msg += 'Reply-To: ' + cleanHeader(replyTo) + '\r\n';
  msg += 'To: ' + cleanHeader(recipients) + '\r\n';
  msg += 'Subject: ' + cleanHeader(subject) + '\r\n';
  msg += 'Date: ' + new Date().toUTCString() + '\r\n';
  msg += 'Message-ID: ' + messageId + '\r\n';
  msg += 'X-Mailer: CoCoMail\r\n';
  msg += 'Auto-Submitted: auto-generated\r\n';
  msg += 'MIME-Version: 1.0\r\n';
  for (const [name, value] of cleanCustomHeaders(headers)) {
    msg += name + ': ' + value + '\r\n';
  }

  if (hasHtml) {
    msg += 'Content-Type: multipart/alternative; boundary="' + boundary + '"\r\n';
    msg += '\r\n';
    msg += '--' + boundary + '\r\n';
    msg += 'Content-Type: text/plain; charset="UTF-8"\r\n';
    msg += 'Content-Transfer-Encoding: 8bit\r\n';
    msg += '\r\n' + plainText + '\r\n\r\n';
    msg += '--' + boundary + '\r\n';
    msg += 'Content-Type: text/html; charset="UTF-8"\r\n';
    msg += 'Content-Transfer-Encoding: 8bit\r\n';
    msg += '\r\n' + html + '\r\n\r\n';
    msg += '--' + boundary + '--\r\n';
  } else {
    msg += 'Content-Type: text/plain; charset="UTF-8"\r\n';
    msg += 'Content-Transfer-Encoding: 8bit\r\n';
    msg += '\r\n' + plainText + '\r\n';
  }

  return { message: msg, messageId };
}

function resolveSmtpConfig(config) {
  const smtp = (config && config.smtp) || {};
  const host = smtp.host || process.env.COCOMAIL_SMTP_HOST || process.env.SMTP_HOST;
  if (!host) return null;
  const port = Number(smtp.port || process.env.COCOMAIL_SMTP_PORT || process.env.SMTP_PORT || 25);
  const user = smtp.user || process.env.COCOMAIL_SMTP_USER || process.env.SMTP_USER;
  const pass = smtp.pass || smtp.password || process.env.COCOMAIL_SMTP_PASS || process.env.SMTP_PASS;
  return {
    host,
    port,
    secure: smtp.secure !== undefined ? Boolean(smtp.secure) : port === 465,
    user,
    pass,
    ignoreTLS: smtp.ignoreTLS !== undefined
      ? Boolean(smtp.ignoreTLS)
      : host === '127.0.0.1' || host === 'localhost' || host === '::1',
    rejectUnauthorized: smtp.rejectUnauthorized !== false,
  };
}

function sendViaSendmail({ message, from, sendmailPath }) {
  return new Promise((resolve, reject) => {
    const path = sendmailPath || process.env.COCOMAIL_SENDMAIL || DEFAULT_SENDMAIL;
    if (!fs.existsSync(path)) {
      reject(new Error('sendmail binary not found at ' + path));
      return;
    }
    const args = ['-t', '-i', '-f', bareAddress(from)];
    const name = displayName(from);
    if (name) args.push('-F', name);
    const proc = spawn(path, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    proc.on('error', reject);
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    proc.on('close', (code) => {
      if (code === 0) resolve({ queueId: null });
      else reject(new Error('sendmail exited with code ' + code + ': ' + stderr.trim()));
    });
    proc.stdin.write(message);
    proc.stdin.end();
  });
}

async function sendViaSmtp(payload, smtp) {
  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch {
    throw new Error('nodemailer is not installed');
  }
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user && smtp.pass ? { user: smtp.user, pass: smtp.pass } : undefined,
    ignoreTLS: smtp.ignoreTLS,
    tls: { rejectUnauthorized: smtp.rejectUnauthorized },
  });
  const info = await transporter.sendMail({
    from: payload.from,
    to: payload.to,
    replyTo: payload.replyTo || undefined,
    subject: payload.subject,
    html: payload.html,
    text: payload.text || stripHtml(payload.html),
    headers: Object.fromEntries(cleanCustomHeaders(payload.headers)),
  });
  const m = /queued as ([A-Za-z0-9._-]+)/i.exec(info.response || '');
  return { queueId: m ? m[1] : null };
}

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Email payload must be an object');
  const { from, to, subject, html, text } = payload;
  if (!from) throw new Error('Missing required field: from');
  if (!to) throw new Error('Missing required field: to');
  if (!subject) throw new Error('Missing required field: subject');
  if (!html && !text) throw new Error('Missing required field: html or text');
  bareAddress(from);
  const recipients = Array.isArray(to) ? to : [to];
  if (recipients.length === 0) throw new Error('At least one recipient is required');
  if (recipients.length > MAX_RECIPIENTS) throw new Error('Too many recipients (max ' + MAX_RECIPIENTS + ')');
  for (const recipient of recipients) bareAddress(recipient);
  if (payload.replyTo || payload.reply_to) bareAddress(payload.replyTo || payload.reply_to);
  return recipients;
}

class Emails {
  constructor(client) {
    this.client = client;
  }

  async send(payload) {
    validatePayload(payload);
    const normalized = {
      ...payload,
      to: Array.isArray(payload.to) ? payload.to : [payload.to],
      replyTo: payload.replyTo || payload.reply_to || undefined,
      text: payload.text || undefined,
    };
    const { message, messageId } = buildMimeMessage(normalized);
    const id = messageId.replace(/[<>]/g, '').split('@')[0];
    const base = {
      id,
      messageId,
      from: payload.from,
      to: payload.to,
      status: 'queued',
      created_at: new Date().toISOString(),
    };

    // Test/embedding hook: a function that accepts the constructed message.
    if (typeof this.client.config.transport === 'function') {
      const out = await this.client.config.transport({ message, payload: normalized, id });
      return { ...base, ...(out || {}) };
    }

    const smtp = resolveSmtpConfig(this.client.config);
    let smtpError = null;
    if (smtp) {
      try {
        const out = await sendViaSmtp(normalized, smtp);
        return { ...base, queueId: out.queueId };
      } catch (err) {
        smtpError = err;
      }
    }

    try {
      const out = await sendViaSendmail({
        message,
        from: normalized.from,
        sendmailPath: this.client.config.sendmailPath,
      });
      return { ...base, queueId: out.queueId };
    } catch (sendmailError) {
      const detail = smtpError
        ? 'SMTP failed (' + smtpError.message + '); sendmail failed (' + sendmailError.message + ')'
        : 'Could not queue email: ' + sendmailError.message;
      throw new Error(detail);
    }
  }
}

class CocoMail {
  constructor(config = {}) {
    this.config = config || {};
    this.emails = new Emails(this);
  }
}

module.exports = {
  CocoMail,
  Resend: CocoMail,
  default: CocoMail,
  // Exported for tests and advanced embedding.
  _internal: { buildMimeMessage, bareAddress, validatePayload, stripHtml },
};
