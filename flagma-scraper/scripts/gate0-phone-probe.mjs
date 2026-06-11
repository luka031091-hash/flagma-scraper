// GATE №0: перевіряє, що телефон продавця присутній у СТАТИЧНОМУ HTML detail-сторінки
// (без логіну/капчі/JS). Використовує вбудований fetch (Node 18+).
const SAMPLE = process.argv.slice(2);
if (!SAMPLE.length) {
  console.error('Usage: node scripts/gate0-phone-probe.mjs <detailUrl> [detailUrl...]');
  process.exit(1);
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const PHONE_RE = /<a[^>]*class=['"]tel['"][^>]*href=['"]tel:([^'"]+)['"]/gi;

let withPhone = 0;
for (const url of SAMPLE) {
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA } });
    const html = await res.text();
    const inDialog = /id=["']contactDialog["']/.test(html);
    const phones = [...html.matchAll(PHONE_RE)].map((m) => m[1].replace(/[^\d+]/g, ''));
    const ok = inDialog && phones.length > 0;
    if (ok) withPhone += 1;
    console.log(`${ok ? 'OK ' : 'NO '} ${url} → ${phones.slice(0, 3).join(', ') || '—'}`);
  } catch (e) {
    console.log(`ERR ${url} → ${e.message}`);
  }
}

const ratio = SAMPLE.length ? withPhone / SAMPLE.length : 0;
const verdict = ratio >= 0.8 ? 'GO (підхід A — телефон у статичному HTML)' : 'NO-GO → підхід B (PlaywrightCrawler, реальний клік)';
console.log(`\nРезультат: ${withPhone}/${SAMPLE.length} (${(ratio * 100).toFixed(0)}%) → ${verdict}`);
