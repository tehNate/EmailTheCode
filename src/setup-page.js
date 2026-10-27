'use strict';

const fs = require('node:fs');
const path = require('node:path');

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

function relativeHost(host, domain) {
  const h = String(host || '').trim();
  const d = String(domain || '').trim().toLowerCase();
  if (!h) return '';
  if (d && h.toLowerCase() === d) return '@';
  if (d && h.toLowerCase().endsWith('.' + d)) return h.slice(0, -(d.length + 1));
  return h;
}

function splitList(value) {
  return String(value || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function parseExtraA(value) {
  return splitList(value).map((item) => {
    const idx = item.indexOf('=');
    if (idx < 0) return { host: item, value: '' };
    return { host: item.slice(0, idx).trim(), value: item.slice(idx + 1).trim() };
  }).filter((r) => r.host);
}

function splitPipe(value) {
  return String(value || '')
    .split('|')
    .map((v) => v.trim())
    .filter(Boolean);
}

function parseDkimKeyText(text) {
  const raw = String(text || '')
    .replace(/^\s*;.*$/gm, '')
    .replace(/;\s*-----[\s\S]*$/, '');
  const quoted = raw.match(/"([^"]*)"/g);
  if (quoted && quoted.length) return quoted.map((s) => s.slice(1, -1)).join('');
  return raw.replace(/\s+/g, ' ').trim();
}

function readDkimKeyFile(file) {
  try {
    return parseDkimKeyText(fs.readFileSync(file, 'utf8'));
  } catch {
    return '';
  }
}

function defaultConfig() {
  return {
    brand: 'EmailTheCode',
    domain: '',
    mailHost: '',
    ip: '',
    ipv6: '',
    dkimSelector: 'emailthecode',
    dkimKey: '',
    spf: '',
    spfNote: '',
    dmarc: 'v=DMARC1; p=none;',
    dmarcNote: '',
    extraA: [],
    ptrHost: '',
    ptrProvider: '',
    ptrSkipped: false,
    provider: '',
    providerSteps: '',
    sendOnly: true,
    note: '',
    notes: [],
    generatedAt: new Date().toISOString().slice(0, 10),
  };
}

function setupConfigFromEnv(env = process.env) {
  const cfg = defaultConfig();
  const domain = String(env.EMAILTHECODE_DOMAIN || env.MAIL_DOMAIN || addressDomain(env.EMAIL_FROM || env.EMAILTHECODE_FROM || '')).toLowerCase();
  const selector = String(env.EMAILTHECODE_DKIM_SELECTOR || cfg.dkimSelector);
  const mailHost = String(env.EMAILTHECODE_MAIL_HOST || (domain ? 'mail.' + domain : ''));
  const keyFile = env.EMAILTHECODE_DKIM_KEY_FILE
    || (domain ? path.join('/etc/opendkim/keys', domain, selector + '.txt') : '');
  cfg.brand = env.EMAILTHECODE_BRAND || cfg.brand;
  cfg.domain = domain;
  cfg.mailHost = mailHost;
  cfg.ip = String(env.EMAILTHECODE_PUBLIC_IP || '');
  cfg.ipv6 = String(env.EMAILTHECODE_IPV6 || '');
  cfg.dkimSelector = selector;
  cfg.dkimKey = String(env.EMAILTHECODE_DKIM_KEY || (keyFile ? readDkimKeyFile(keyFile) : ''));
  const includes = splitList(env.EMAILTHECODE_SPF_INCLUDE);
  cfg.spf = String(env.EMAILTHECODE_SPF || ('v=spf1' + (cfg.ip ? ' ip4:' + cfg.ip : '') + includes.map((i) => ' include:' + i).join('') + ' ~all'));
  cfg.spfNote = String(env.EMAILTHECODE_SPF_NOTE || '');
  cfg.dmarc = env.EMAILTHECODE_DMARC || cfg.dmarc;
  cfg.dmarcNote = String(env.EMAILTHECODE_DMARC_NOTE || '');
  cfg.extraA = parseExtraA(env.EMAILTHECODE_EXTRA_A);
  cfg.ptrHost = String(env.EMAILTHECODE_PTR_HOST || mailHost);
  cfg.ptrProvider = String(env.EMAILTHECODE_PTR_PROVIDER || '');
  cfg.ptrSkipped = String(env.EMAILTHECODE_PTR_SKIPPED || 'false') === 'true';
  cfg.provider = String(env.EMAILTHECODE_PROVIDER || '');
  cfg.providerSteps = String(env.EMAILTHECODE_PROVIDER_STEPS || '');
  cfg.sendOnly = String(env.EMAILTHECODE_SEND_ONLY || 'true') !== 'false';
  cfg.note = String(env.EMAILTHECODE_SETUP_NOTE || '');
  cfg.notes = splitPipe(env.EMAILTHECODE_NOTES);
  return cfg;
}

function mergeConfig(base, overrides = {}) {
  return Object.assign({}, defaultConfig(), base || {}, overrides || {});
}

function recordsFor(config) {
  const cfg = mergeConfig(config);
  const domain = cfg.domain || 'example.com';
  const ip = cfg.ip || '(set EMAILTHECODE_PUBLIC_IP)';
  const mailHost = cfg.mailHost || ('mail.' + domain);
  const mailField = relativeHost(mailHost, domain) || 'mail';
  const dkimHost = cfg.dkimSelector + '._domainkey';
  const rows = [
    { type: 'A', host: mailField, value: ip, label: 'Mail host' },
    ...cfg.extraA.map((r) => ({ type: 'A', host: relativeHost(r.host, domain), value: r.value || ip, label: 'Extra A' })),
    { type: 'TXT', host: '@', value: cfg.spf, label: 'SPF' },
    { type: 'TXT', host: dkimHost, value: cfg.dkimKey || '(paste your DKIM public key)', label: 'DKIM' },
    { type: 'TXT', host: '_dmarc', value: cfg.dmarc, label: 'DMARC' },
  ];
  return { cfg, domain, ip, mailHost, mailField, dkimHost, rows };
}

function renderSetupText(config) {
  const { cfg, domain, ip, mailHost, dkimHost, rows } = recordsFor(config);
  const ptrLabel = (cfg.ptrProvider ? cfg.ptrProvider + ' ' : '') + 'PTR';
  const extraHosts = rows.filter((r) => r.label === 'Extra A')
    .map((r) => (r.host === '@' ? domain : r.host + '.' + domain));
  const lines = [];
  lines.push(cfg.brand + ' DNS setup — ' + domain);
  lines.push('Generated ' + cfg.generatedAt);
  lines.push('');
  for (const r of rows) {
    lines.push([r.type.padEnd(4), r.host.padEnd(24), r.value].join(' ').trimEnd());
    if (r.label === 'SPF' && cfg.spfNote) lines.push('     # ' + cfg.spfNote);
    if (r.label === 'DMARC' && cfg.dmarcNote) lines.push('     # ' + cfg.dmarcNote);
  }
  lines.push('');
  lines.push(ptrLabel + (cfg.ptrSkipped ? ' (skipped)' : '') + ': ' + ip + ' -> ' + (cfg.ptrHost || mailHost));
  if (cfg.ipv6) lines.push('Optional IPv6 PTR: ' + cfg.ipv6 + ' -> ' + (cfg.ptrHost || mailHost));
  if (cfg.sendOnly) lines.push('Do NOT change MX: this mail server is send-only.');
  if (cfg.note) lines.push('', cfg.note);
  for (const n of cfg.notes) lines.push('', n);
  lines.push('', 'Verify:', '  dig +short A ' + mailHost, ...extraHosts.map((h) => '  dig +short A ' + h), '  dig +short TXT ' + domain, '  dig +short TXT ' + dkimHost + '.' + domain, '  dig +short TXT _dmarc.' + domain, '  dig +short -x ' + ip, '  opendkim-testkey -d ' + domain + ' -s ' + cfg.dkimSelector + ' -vvv');
  return lines.join('\n');
}

function renderSetupPage(config) {
  const { cfg, domain, ip, mailHost, mailField, dkimHost, rows } = recordsFor(config);
  const title = cfg.brand + ' DNS setup' + (cfg.domain ? ' — ' + cfg.domain : '');
  const verify = [
    'dig +short A ' + mailHost,
    ...rows.filter((r) => r.label === 'Extra A').map((r) => 'dig +short A ' + (r.host === '@' ? domain : r.host + '.' + domain)),
    'dig +short TXT ' + domain,
    'dig +short TXT ' + dkimHost + '.' + domain,
    'dig +short TXT _dmarc.' + domain,
    'dig +short -x ' + ip,
    'opendkim-testkey -d ' + domain + ' -s ' + cfg.dkimSelector + ' -vvv',
  ].join('\n');
  const all = renderSetupText(cfg);
  const rowHtml = rows.map((r) => {
    const id = 'v-' + r.type.toLowerCase() + '-' + r.host.replace(/[^a-z0-9]/gi, '-');
    const long = r.type === 'TXT' && r.value.length > 80;
    const note = r.label === 'SPF' ? cfg.spfNote : (r.label === 'DMARC' ? cfg.dmarcNote : '');
    const dkimHint = r.label === 'DKIM'
      ? '<div class="small muted">Paste as one value — do not add line breaks.</div>'
      : '';
    const valueHtml = long
      ? `<textarea id="${id}" rows="4" readonly onclick="this.select()">${escapeHtml(r.value)}</textarea>`
      : `<code class="val" id="${id}">${escapeHtml(r.value)}</code>`;
    return `<div class="card"><div class="row"><div class="grow"><div class="label">${escapeHtml(r.label)} — ${escapeHtml(r.type)}</div><div class="small">Host <code>${escapeHtml(r.host)}</code></div>${valueHtml}${dkimHint}${note ? `<p class="small muted">${escapeHtml(note)}</p>` : ''}</div><button class="copy" onclick="copyId('${id}', this)">Copy ${escapeHtml(r.type === 'TXT' && r.label === 'DKIM' ? 'DKIM' : 'value')}</button></div></div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${escapeHtml(title)}</title>
<style>
  :root { --bg:#0f1115; --card:#171a21; --line:#2a2f3a; --text:#e8ecf3; --dim:#9aa4b2; --good:#3ddc84; --warn:#ffcc66; --bad:#ff6b6b; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:16px/1.55 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; }
  main { max-width:920px; margin:0 auto; padding:28px 18px 80px; }
  h1 { font-size:1.55rem; margin:0 0 6px; }
  h2 { font-size:1.15rem; margin:28px 0 10px; }
  p, li { color:var(--text); }
  .muted { color:var(--dim); }
  .card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:16px; margin:12px 0; }
  .row { display:flex; gap:10px; align-items:flex-start; flex-wrap:wrap; }
  .grow { flex:1 1 420px; min-width:0; }
  .label { font-size:.8rem; letter-spacing:.04em; text-transform:uppercase; color:var(--dim); margin-bottom:4px; }
  code, textarea { font-family: ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; }
  code.val { display:block; background:#0b0d11; border:1px solid var(--line); border-radius:8px; padding:10px 12px; color:#d7e2ff; word-break:break-all; }
  textarea { width:100%; background:#0b0d11; color:#d7e2ff; border:1px solid var(--line); border-radius:8px; padding:10px 12px; font-size:.82rem; line-height:1.45; resize:vertical; }
  button { cursor:pointer; border:1px solid #3b4352; background:#202634; color:#e8ecf3; border-radius:8px; padding:8px 12px; font-size:.88rem; }
  button:hover { background:#273042; }
  button.gold { background:#c9a227; border-color:#c9a227; color:#111; font-weight:600; }
  .badge { display:inline-block; font-size:.75rem; padding:2px 8px; border-radius:999px; border:1px solid var(--line); color:var(--dim); }
  .warn { border-left:3px solid var(--warn); padding:10px 12px; background:#1d1a10; border-radius:8px; }
  .ok { border-left:3px solid var(--good); padding:10px 12px; background:#101d15; border-radius:8px; }
  .small { font-size:.85rem; }
</style>
</head>
<body>
<main>
  <span class="badge">Public DNS records — no secrets</span>
  <h1>${escapeHtml(title)}</h1>
  <p class="muted">Generated by ${escapeHtml(cfg.brand)} on ${escapeHtml(cfg.generatedAt)}. Add these records at your DNS provider, then verify. This page contains only public DNS data.</p>
  <div class="ok"><strong>What this does:</strong> authorizes this mail server to send as <code>@${escapeHtml(domain)}</code> (SPF), adds DKIM selector <code>${escapeHtml(cfg.dkimSelector)}</code>, adds DMARC monitoring, and points <code>${escapeHtml(mailHost)}</code> at <code>${escapeHtml(ip)}</code>. The PTR step is separate.</div>
  <h2>1. DNS records</h2>
  ${cfg.provider ? `<p class="small">At <strong>${escapeHtml(cfg.provider)}</strong>${cfg.providerSteps ? ' — ' + escapeHtml(cfg.providerSteps) : ''}.</p>` : ''}
  <p class="small">TTL: Automatic or 300. Keep exactly one SPF record at <code>@</code>.</p>
  ${rowHtml}
  ${cfg.sendOnly ? '<div class="warn"><strong>Do not change MX.</strong> This mail server is send-only. If you use a separate inbound provider, leave its MX records unchanged. Do not add MX for the mail host.</div>' : ''}
  ${cfg.note ? `<p class="small muted">${escapeHtml(cfg.note)}</p>` : ''}
  ${cfg.notes.length ? '<ul class="small muted">' + cfg.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('') + '</ul>' : ''}
  <h2>2. Reverse DNS (PTR) — ${cfg.ptrSkipped ? 'optional / skipped' : 'set at your host'}</h2>
  ${cfg.ptrSkipped ? '<div class="warn"><strong>PTR skipped.</strong> SPF/DKIM/DMARC still pass. If receivers mark mail as spam, set the PTR or relay through a reputable smarthost.</div>' : ''}
  <div class="card"><div class="row"><div class="grow"><div class="label">PTR target</div><code class="val" id="v-ptr">${escapeHtml(cfg.ptrHost || mailHost)}</code></div><button class="copy" onclick="copyId('v-ptr', this)">Copy hostname</button></div><p class="small muted">At ${cfg.ptrProvider ? escapeHtml(cfg.ptrProvider) : 'your hosting provider'}, set the reverse DNS for <code>${escapeHtml(ip)}</code> to <code>${escapeHtml(cfg.ptrHost || mailHost)}</code>. The A record above must exist first.</p>${cfg.ipv6 ? `<p class="small muted">Optional IPv6: <code>${escapeHtml(cfg.ipv6)}</code> → <code>${escapeHtml(cfg.ptrHost || mailHost)}</code>.</p>` : ''}</div>
  <h2>3. Verify</h2>
  <div class="card"><textarea id="v-verify" rows="7" readonly onclick="this.select()">${escapeHtml(verify)}</textarea><div class="row" style="margin-top:10px"><button class="copy" onclick="copyId('v-verify', this)">Copy commands</button></div><p class="small muted">Expected: the A record resolves; SPF/DKIM/DMARC are present; the PTR matches (if set); <code>opendkim-testkey</code> says the key is OK.</p></div>
  <h2>Copy everything</h2>
  <div class="row"><button class="gold copy" onclick="copyId('v-all', this)">Copy all records</button><button onclick="downloadTxt()">Download .txt</button></div>
  <textarea id="v-all" rows="10" readonly onclick="this.select()">${escapeHtml(all)}</textarea>
  <p class="small muted">Generated by ${escapeHtml(cfg.brand)} ${escapeHtml(require('../package.json').version)}. Remove this page after setup if you prefer.</p>
</main>
<script>
function copyId(id, btn) {
  const el = document.getElementById(id);
  if (!el) return;
  const text = (el.value !== undefined ? el.value : el.textContent).trim();
  const done = () => { if (!btn) return; const old = btn.textContent; btn.textContent = 'Copied ✓'; setTimeout(() => { btn.textContent = old; }, 1500); };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => { selectId(id); });
  } else { selectId(id); }
}
function selectId(id) { const el = document.getElementById(id); if (el) { el.focus(); el.select(); } }
function downloadTxt() {
  const text = document.getElementById('v-all').value;
  const blob = new Blob([text], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '${escapeHtml((cfg.domain || 'emailthecode').replace(/[^a-z0-9.-]/gi, ''))}-dns.txt';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
</script>
</body>
</html>`;
}

module.exports = {
  defaultConfig,
  setupConfigFromEnv,
  parseDkimKeyText,
  readDkimKeyFile,
  renderSetupPage,
  renderSetupText,
  recordsFor,
  _internal: { relativeHost, parseExtraA, splitList, splitPipe, addressDomain },
};
