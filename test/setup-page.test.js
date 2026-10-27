'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EmailTheCode } = require('../src');
const { createApp } = require('../src/server');
const {
  defaultConfig,
  setupConfigFromEnv,
  parseDkimKeyText,
  recordsFor,
  renderSetupPage,
  renderSetupText,
} = require('../src/setup-page');

const COCO = {
  brand: 'CoCo Mail',
  domain: 'cocoio.cc',
  mailHost: 'mail.cocoio.cc',
  ip: '204.168.206.40',
  ipv6: '2a01:4f9:c010:bd19::1',
  dkimSelector: 'coco',
  dkimKey: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A',
  spf: 'v=spf1 ip4:204.168.206.40 include:spf.resend.com ~all',
  spfNote: 'Transition-safe: keeps Resend authorized during the cutover.',
  dmarc: 'v=DMARC1; p=none;',
  dmarcNote: 'Start at p=none and monitor.',
  extraA: [{ host: 'batch', value: '' }],
  provider: 'Namecheap',
  providerSteps: 'Domain List → cocoio.cc → Manage → Advanced DNS',
  ptrHost: 'mail.cocoio.cc',
  ptrProvider: 'Hetzner Cloud',
  ptrSkipped: true,
  sendOnly: true,
  note: 'CoCo note',
  notes: ['Do not touch the MX records.', 'Do not change anything on companycoin.org today.'],
};

test('builds DNS records from the config', () => {
  const { rows, mailField, dkimHost } = recordsFor(COCO);
  assert.equal(mailField, 'mail');
  assert.equal(dkimHost, 'coco._domainkey');
  const byLabel = Object.fromEntries(rows.map((r) => [r.label, r]));
  assert.equal(byLabel['Mail host'].value, '204.168.206.40');
  assert.equal(byLabel['Extra A'].host, 'batch');
  assert.equal(byLabel['Extra A'].value, '204.168.206.40');
  assert.equal(byLabel.SPF.value, COCO.spf);
  assert.equal(byLabel.DKIM.host, 'coco._domainkey');
  assert.equal(byLabel.DMARC.host, '_dmarc');
});

test('relativeHost renders the apex as @', () => {
  const { rows } = recordsFor({ domain: 'example.com', mailHost: 'example.com' });
  const mail = rows.find((r) => r.label === 'Mail host');
  assert.equal(mail.host, '@');
});

test('renders a self-contained page with the records and copy controls', () => {
  const html = renderSetupPage(COCO);
  assert.match(html, /^<!DOCTYPE html>/);
  assert.match(html, /cocoio\.cc/);
  assert.match(html, /mail\.cocoio\.cc/);
  assert.match(html, /204\.168\.206\.40/);
  assert.match(html, /coco\._domainkey/);
  assert.match(html, /spf\.resend\.com/);
  assert.match(html, /_dmarc/);
  assert.match(html, /copyId\(/);
  assert.match(html, /downloadTxt\(/);
  assert.match(html, /optional \/ skipped/);
  assert.match(html, /Do not change MX/);
  assert.match(html, /noindex/);
  assert.match(html, /Namecheap/);
  assert.match(html, /Transition-safe/);
  assert.match(html, /Start at p=none/);
  assert.match(html, /Hetzner Cloud/);
  assert.match(html, /2a01:4f9:c010:bd19::1/);
  assert.match(html, /keep exactly one SPF/i);
  // No unrendered template holes.
  assert.doesNotMatch(html, /\$\{/);
});

test('renders the plain-text records', () => {
  const text = renderSetupText(COCO);
  assert.match(text, /^CoCo Mail DNS setup — cocoio\.cc/m);
  assert.match(text, /A\s+mail\s+204\.168\.206\.40/);
  assert.match(text, /TXT\s+_dmarc\s+v=DMARC1; p=none;/);
  assert.match(text, /Hetzner Cloud PTR \(skipped\)/);
  assert.match(text, /dig \+short A batch\.cocoio\.cc/);
  assert.match(text, /# Transition-safe/);
  assert.match(text, /# Start at p=none/);
  assert.match(text, /Optional IPv6 PTR: 2a01:4f9:c010:bd19::1/);
  assert.match(text, /Do not touch the MX records\./);
  assert.match(text, /opendkim-testkey -d cocoio\.cc -s coco -vvv/);
});

test('escapes HTML in config values', () => {
  const html = renderSetupPage({ domain: 'example.com', brand: '<script>x</script>', note: 'a & b' });
  assert.doesNotMatch(html, /<script>x<\/script>/);
  assert.match(html, /&lt;script&gt;x&lt;\/script&gt;/);
  assert.match(html, /a &amp; b/);
});

test('setupConfigFromEnv reads EMAILTHECODE_* and legacy names', () => {
  const cfg = setupConfigFromEnv({
    EMAILTHECODE_DOMAIN: 'example.com',
    EMAILTHECODE_PUBLIC_IP: '203.0.113.9',
    EMAILTHECODE_DKIM_SELECTOR: 'mail',
    EMAILTHECODE_SPF_INCLUDE: 'spf.resend.com,_spf.google.com',
    EMAILTHECODE_EXTRA_A: 'batch=,www=203.0.113.10',
    EMAILTHECODE_DMARC: 'v=DMARC1; p=quarantine;',
    EMAILTHECODE_PTR_SKIPPED: 'true',
  });
  assert.equal(cfg.domain, 'example.com');
  assert.equal(cfg.mailHost, 'mail.example.com');
  assert.equal(cfg.ip, '203.0.113.9');
  assert.equal(cfg.dkimSelector, 'mail');
  assert.equal(cfg.spf, 'v=spf1 ip4:203.0.113.9 include:spf.resend.com include:_spf.google.com ~all');
  assert.deepEqual(cfg.extraA, [
    { host: 'batch', value: '' },
    { host: 'www', value: '203.0.113.10' },
  ]);
  assert.equal(cfg.dmarc, 'v=DMARC1; p=quarantine;');
  assert.equal(cfg.ptrSkipped, true);

  const fromAddress = setupConfigFromEnv({ EMAIL_FROM: 'CoCo <noreply@cocoio.cc>', EMAILTHECODE_PUBLIC_IP: '1.2.3.4' });
  assert.equal(fromAddress.domain, 'cocoio.cc');
});

test('parseDkimKeyText joins quoted chunks and strips comments', () => {
  assert.equal(parseDkimKeyText('"AAA" "BBB"\n; -----BEGIN'), 'AAABBB');
  assert.equal(parseDkimKeyText('AAA BBB\n; comment'), 'AAA BBB');
});

test('GET /setup serves the page without an API key', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'etc-setup-'));
  const server = createApp({
    mailer: new EmailTheCode({ transport: async () => ({}) }),
    apiKey: 'test-key',
    logFile: path.join(dir, 'log.jsonl'),
    setup: COCO,
    logger: { error() {}, log() {} },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    let res = await fetch(base + '/setup');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const html = await res.text();
    assert.match(html, /coco\._domainkey/);

    res = await fetch(base + '/setup?format=txt');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/plain/);
    assert.match(await res.text(), /CoCo Mail DNS setup/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
