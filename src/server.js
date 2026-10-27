'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { EmailTheCode } = require('./index');
const { setupConfigFromEnv, renderSetupPage, renderSetupText } = require('./setup-page');

const MAX_BODY = 2 * 1024 * 1024;
const DEFAULT_RATE_LIMIT = 120;

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function bearerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

function apiKeyOk(req, expected) {
  const token = bearerToken(req);
  if (!token || token.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('Body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function bareAddress(value) {
  const s = String(value || '');
  const m = s.match(/<([^>]+)>/);
  return (m ? m[1] : s).trim();
}

function addressDomain(value) {
  const addr = bareAddress(value);
  const at = addr.lastIndexOf('@');
  return at >= 0 ? addr.slice(at + 1).toLowerCase() : '';
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function createApp(options) {
  const {
    mailer,
    apiKey,
    logFile = process.env.EMAILTHECODE_LOG_FILE || process.env.MAIL_LOG_FILE || './emailthecode.jsonl',
    allowedFromDomains = [],
    rateLimit = DEFAULT_RATE_LIMIT,
    setup = {},
    logger = console,
  } = options || {};

  if (!mailer || !mailer.emails || typeof mailer.emails.send !== 'function') {
    throw new Error('createApp requires a EmailTheCode instance');
  }
  if (!apiKey) throw new Error('apiKey is required');

  const allowed = (Array.isArray(allowedFromDomains) ? allowedFromDomains : String(allowedFromDomains || '').split(','))
    .map((domain) => String(domain).trim().toLowerCase())
    .filter(Boolean);

  fs.mkdirSync(path.dirname(path.resolve(logFile)), { recursive: true });

  const hits = new Map();
  function rateLimited(ip) {
    const now = Date.now();
    let entry = hits.get(ip);
    if (!entry || now > entry.reset) {
      entry = { count: 0, reset: now + 60_000 };
      hits.set(ip, entry);
    }
    entry.count += 1;
    return entry.count > rateLimit;
  }

  function appendLog(entry) {
    try {
      fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
    } catch (err) {
      logger.error('[EmailTheCode] log write failed:', err.message);
    }
  }

  function readLog(limit = 100) {
    try {
      const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean);
      return lines.slice(-limit)
        .map((line) => { try { return JSON.parse(line); } catch { return null; } })
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  return http.createServer(async (req, res) => {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const ip = forwarded || req.socket.remoteAddress || 'unknown';
    if (rateLimited(ip)) return json(res, 429, { error: 'Too many requests' });

    const url = new URL(req.url, 'http://localhost');

    if (req.method === 'GET' && url.pathname === '/health') {
      return json(res, 200, {
        status: 'ok',
        service: 'emailthecode',
        time: new Date().toISOString(),
      });
    }

    // Public setup page: DNS records for this deployment. Contains no secrets.
    if (req.method === 'GET' && url.pathname === '/setup') {
      if (url.searchParams.get('format') === 'txt') {
        const text = renderSetupText(setup);
        res.writeHead(200, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Length': Buffer.byteLength(text),
          'Cache-Control': 'no-store',
        });
        return res.end(text);
      }
      const html = renderSetupPage(setup);
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': Buffer.byteLength(html),
        'Cache-Control': 'no-store',
      });
      return res.end(html);
    }

    if (!apiKeyOk(req, apiKey)) return json(res, 401, { error: 'Unauthorized' });

    if (req.method === 'POST' && url.pathname === '/emails') {
      try {
        const raw = await readBody(req);
        let body;
        try {
          body = JSON.parse(raw || '{}');
        } catch {
          return json(res, 400, { error: 'Invalid JSON' });
        }
        const { from, to, subject, html, text, reply_to, replyTo, headers } = body;
        if (!from || !to || !subject || (!html && !text)) {
          return json(res, 400, { error: 'from, to, subject, and html or text are required' });
        }
        if (!validEmail(bareAddress(from))) return json(res, 400, { error: 'Invalid from' });
        const domain = addressDomain(from);
        if (allowed.length && !allowed.includes(domain)) {
          return json(res, 400, { error: 'From domain not allowed: ' + domain });
        }
        const recipients = Array.isArray(to) ? to : [to];
        if (recipients.length < 1 || recipients.length > 50) {
          return json(res, 400, { error: 'to must be 1..50 addresses' });
        }
        for (const recipient of recipients) {
          if (!validEmail(recipient)) return json(res, 400, { error: 'Invalid recipient: ' + recipient });
        }

        const out = await mailer.emails.send({ from, to, subject, html, text, replyTo: reply_to || replyTo, headers });
        const entry = {
          id: out.id,
          queueId: out.queueId || null,
          from,
          to: recipients,
          subject: String(subject).slice(0, 200),
          status: out.status || 'queued',
          ts: new Date().toISOString(),
        };
        appendLog(entry);
        return json(res, 200, {
          id: out.id,
          queueId: out.queueId || null,
          status: out.status || 'queued',
        });
      } catch (err) {
        logger.error('[EmailTheCode] send failed:', err.message);
        return json(res, 502, { error: err.message });
      }
    }

    if (req.method === 'GET' && url.pathname.startsWith('/emails/')) {
      const id = decodeURIComponent(url.pathname.slice('/emails/'.length));
      const found = readLog(5000).find((entry) => entry.id === id || entry.queueId === id);
      if (!found) return json(res, 404, { error: 'Not found' });
      return json(res, 200, found);
    }

    if (req.method === 'GET' && url.pathname === '/emails') {
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10) || 50, 500);
      return json(res, 200, { emails: readLog(limit).reverse() });
    }

    return json(res, 404, { error: 'Not found' });
  });
}

function configFromEnv(env = process.env) {
  const apiKey = env.EMAILTHECODE_API_KEY || env.MAIL_API_KEY;
  if (!apiKey) throw new Error('EMAILTHECODE_API_KEY is not set');
  return {
    host: env.EMAILTHECODE_HOST || env.MAIL_HOST || '127.0.0.1',
    port: parseInt(env.EMAILTHECODE_PORT || env.MAIL_PORT || '3100', 10),
    apiKey,
    logFile: env.EMAILTHECODE_LOG_FILE || env.MAIL_LOG_FILE || './emailthecode.jsonl',
    allowedFromDomains: (env.EMAILTHECODE_ALLOWED_FROM_DOMAINS || env.MAIL_ALLOWED_FROM_DOMAINS || '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
    rateLimit: parseInt(env.EMAILTHECODE_RATE_LIMIT || '120', 10),
  };
}

function startServer(options = {}) {
  const env = options.env || process.env;
  const config = configFromEnv(env);
  const mailer = options.mailer || new EmailTheCode();
  const setup = options.setup || setupConfigFromEnv(env);
  const server = createApp({
    mailer,
    apiKey: config.apiKey,
    logFile: config.logFile,
    allowedFromDomains: config.allowedFromDomains,
    rateLimit: config.rateLimit,
    setup,
    logger: options.logger || console,
  });
  const host = options.host || config.host;
  const port = options.port !== undefined ? options.port : config.port;
  server.listen(port, host, () => {
    const address = server.address();
    const actualPort = address && typeof address === 'object' ? address.port : port;
    (options.logger || console).log('[EmailTheCode] listening on http://' + host + ':' + actualPort);
  });
  return { server, config, host, port };
}

module.exports = {
  createApp,
  startServer,
  configFromEnv,
  setupConfigFromEnv,
  // exported for tests
  _internal: { apiKeyOk, addressDomain, validEmail },
};
