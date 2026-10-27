'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EmailTheCode } = require('../src');
const { createApp, configFromEnv } = require('../src/server');

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    resolve(server.address().port);
  }));
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

test('configFromEnv reads namespaced and legacy variables', () => {
  const config = configFromEnv({
    EMAILTHECODE_API_KEY: 'key',
    EMAILTHECODE_HOST: '0.0.0.0',
    EMAILTHECODE_PORT: '3200',
    EMAILTHECODE_ALLOWED_FROM_DOMAINS: 'example.com, example.org',
  });
  assert.equal(config.apiKey, 'key');
  assert.equal(config.host, '0.0.0.0');
  assert.equal(config.port, 3200);
  assert.deepEqual(config.allowedFromDomains, ['example.com', 'example.org']);

  const legacy = configFromEnv({ MAIL_API_KEY: 'legacy' });
  assert.equal(legacy.apiKey, 'legacy');
});

test('HTTP API requires auth, sends, and can look up the log', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'emailthecode-'));
  const logFile = path.join(dir, 'mail.jsonl');
  const mailer = new EmailTheCode({ transport: async ({ id }) => ({ queueId: 'Q-' + id }) });
  const server = createApp({
    mailer,
    apiKey: 'test-key',
    logFile,
    allowedFromDomains: ['example.com'],
    logger: { error() {}, log() {} },
  });
  const port = await listen(server);
  const base = 'http://127.0.0.1:' + port;
  try {
    let res = await fetch(base + '/health');
    assert.equal(res.status, 200);
    assert.equal((await res.json()).service, 'emailthecode');

    res = await fetch(base + '/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'noreply@example.com', to: 'user@example.net', subject: 's', text: 't' }),
    });
    assert.equal(res.status, 401);

    res = await fetch(base + '/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-key' },
      body: JSON.stringify({ from: 'noreply@example.com', to: 'user@example.net', subject: 's', text: 't' }),
    });
    assert.equal(res.status, 200);
    const sent = await res.json();
    assert.ok(sent.id);
    assert.ok(sent.queueId);

    res = await fetch(base + '/emails/' + sent.id, {
      headers: { Authorization: 'Bearer test-key' },
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).id, sent.id);

    res = await fetch(base + '/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-key' },
      body: JSON.stringify({ from: 'noreply@other.test', to: 'user@example.net', subject: 's', text: 't' }),
    });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /not allowed/);

    res = await fetch(base + '/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-key' },
      body: '{',
    });
    assert.equal(res.status, 400);

    res = await fetch(base + '/emails', { headers: { Authorization: 'Bearer test-key' } });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).emails.length, 1);
  } finally {
    await close(server);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('refuses to create an app without an API key', () => {
  assert.throws(() => createApp({ mailer: new EmailTheCode({ transport: async () => ({}) }) }), /apiKey/);
});
