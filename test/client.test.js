'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { CocoMail, Resend } = require('../src');

test('exports a CocoMail client and Resend alias', () => {
  assert.equal(typeof CocoMail, 'function');
  assert.equal(Resend, CocoMail);
  const client = new CocoMail();
  assert.equal(typeof client.emails.send, 'function');
});

test('validates required fields and addresses', async () => {
  const client = new CocoMail({ transport: async () => ({}) });
  await assert.rejects(() => client.emails.send({ from: 'a@example.com' }), /to/i);
  await assert.rejects(() => client.emails.send({
    from: 'not-an-address', to: 'b@example.com', subject: 's', text: 't',
  }), /Invalid email/);
  await assert.rejects(() => client.emails.send({
    from: 'a@example.com', to: 'bad', subject: 's', text: 't',
  }), /Invalid email/);
});

test('sends through a custom transport and returns a Resend-shaped result', async () => {
  let captured;
  const client = new CocoMail({
    transport: async (input) => {
      captured = input;
      return { queueId: 'QUEUE123' };
    },
  });
  const result = await client.emails.send({
    from: 'Example <noreply@example.com>',
    to: ['one@example.net', 'two@example.net'],
    subject: 'Hello',
    html: '<p>Hi</p>',
    text: 'Hi',
    replyTo: 'support@example.com',
  });
  assert.match(result.id, /^[a-f0-9]{24,}$/);
  assert.equal(result.queueId, 'QUEUE123');
  assert.equal(result.status, 'queued');
  assert.equal(result.from, 'Example <noreply@example.com>');
  assert.deepEqual(result.to, ['one@example.net', 'two@example.net']);
  assert.ok(captured.message.includes('From: Example <noreply@example.com>'));
  assert.ok(captured.message.includes('Reply-To: support@example.com'));
  assert.ok(captured.message.includes('Subject: Hello'));
  assert.ok(captured.message.includes('multipart/alternative'));
});

test('accepts text-only mail', async () => {
  const client = new CocoMail({ transport: async ({ message }) => {
    assert.ok(message.includes('Content-Type: text/plain'));
    return {};
  } });
  const result = await client.emails.send({
    from: 'noreply@example.com',
    to: 'user@example.net',
    subject: 'Text only',
    text: 'Hello',
  });
  assert.equal(result.status, 'queued');
});

test('does not allow header injection through subject or custom headers', async () => {
  let message;
  const client = new CocoMail({ transport: async (input) => {
    message = input.message;
    return {};
  } });
  await client.emails.send({
    from: 'noreply@example.com',
    to: 'user@example.net',
    subject: 'Hello\r\nBcc: attacker@example.org',
    text: 'body',
    headers: {
      'X-Test': 'ok\r\nBcc: attacker@example.org',
      'Bad Header': 'ignored',
    },
  });
  assert.ok(!message.includes('\r\nBcc: attacker@example.org'));
  assert.ok(message.includes('Subject: Hello Bcc: attacker@example.org'));
  assert.ok(message.includes('X-Test: ok Bcc: attacker@example.org'));
  assert.ok(!message.includes('\r\nBad Header:'));
});

test('rejects more than 50 recipients', async () => {
  const client = new CocoMail({ transport: async () => ({}) });
  const recipients = Array.from({ length: 51 }, (_, i) => `u${i}@example.com`);
  await assert.rejects(() => client.emails.send({
    from: 'noreply@example.com',
    to: recipients,
    subject: 'Too many',
    text: 'body',
  }), /Too many recipients/);
});
