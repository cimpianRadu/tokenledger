// Sends a plain-text report email via Resend, same shape as the other projects.
// Subject = argv[2]; body = stdin (plain text, rendered as <pre>).
// Recipient defaults to radu.cimpian94@gmail.com (override with NOTIFY_EMAIL).
// Reads RESEND_API_KEY / RESEND_FROM from .env (or .env.local). Exit codes:
//   0 = sent, 1 = Resend API error, 2 = RESEND_API_KEY missing (caller should fall back).
//
// Usage: echo "raport..." | node scripts/notify-email.mjs "Subiect email"
//
// The default sender is Resend's shared onboarding address, which may only
// write to the address that owns the Resend account. pricepertoken.ai is not a
// verified domain there, so a report to anyone else needs RESEND_FROM pointed
// at a domain that is.

import { appendFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = ['.env', '.env.local']
  .map((f) => resolve(ROOT, f))
  .filter(existsSync)
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');
const get = (k) =>
  env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim().replace(/^["']|["']$/g, '');

const key = get('RESEND_API_KEY') || process.env.RESEND_API_KEY;
const to = process.env.NOTIFY_EMAIL || 'radu.cimpian94@gmail.com';
const from =
  get('RESEND_FROM') || process.env.RESEND_FROM || 'Price Per Token <onboarding@resend.dev>';
const subject = process.argv[2] || 'Raport pricepertoken.ai';

let body = '';
for await (const chunk of process.stdin) body += chunk;
body = body.trim() || '(fără conținut)';
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const html = `<div style="font-family:system-ui,sans-serif"><pre style="font-family:ui-monospace,SFMono-Regular,monospace;font-size:13px;line-height:1.5;white-space:pre-wrap;word-break:break-word">${esc(body)}</pre></div>`;

if (!key) {
  console.error('RESEND_API_KEY missing — email NOT sent. Add it to .env.');
  process.exit(2);
}

// Aceeași oprire temporară ca la celelalte proiecte: cât timp azi (ora
// României) nu a trecut de data din ~/.config/notify-email/oprit-pana-la,
// raportul rămâne local și nu consumă cota Resend.
const opritDir = `${process.env.HOME}/.config/notify-email`;
const opritPanaLa = (() => {
  try {
    return readFileSync(`${opritDir}/oprit-pana-la`, 'utf8').trim();
  } catch {
    return '';
  }
})();
if (
  opritPanaLa &&
  new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Bucharest' }) <= opritPanaLa
) {
  appendFileSync(
    `${opritDir}/rapoarte-netrimise.log`,
    `\n=== ${new Date().toISOString()} ${subject}\n${body}\n`
  );
  console.log(
    `Email NETRIMIS, oprire temporară până la ${opritPanaLa}: "${subject}". ` +
      `Raportul e în ${opritDir}/rapoarte-netrimise.log`
  );
  process.exit(0);
}

const res = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ from, to: [to], subject, html }),
});

if (!res.ok) {
  console.error(`Resend ${res.status}: ${await res.text().catch(() => '')}`);
  process.exit(1);
}
console.log(`Email trimis către ${to}: "${subject}"`);
