export function extractId(url) {
  if (!url || typeof url !== 'string') return null;
  const m = url.match(/-o(\d+)\.html(?:[?#]|$)/);
  return m ? m[1] : null;
}

export function cleanText(s) {
  if (s == null) return '';
  // \s у JS включає NBSP, тож одна заміна нормалізує і пробіли, і &nbsp;
  return String(s).replace(/\s+/g, ' ').trim();
}

const CURRENCY_MAP = [
  { re: /грн|₴|uah/i, code: 'UAH' },
  { re: /\$|usd|дол/i, code: 'USD' },
  { re: /€|eur|євро|евро/i, code: 'EUR' },
];

export function parsePrice(raw) {
  const rawPrice = cleanText(raw);
  const result = { rawPrice: rawPrice || null, normalizedPrice: null, currency: null, priceUnit: null };
  if (!rawPrice) return result;

  for (const { re, code } of CURRENCY_MAP) {
    if (re.test(rawPrice)) { result.currency = code; break; }
  }

  const unitMatch = rawPrice.match(/\/\s*([^\d\s/][^/]*)$/);
  if (unitMatch) {
    const unit = cleanText(unitMatch[1]).replace(/\.$/, '');
    result.priceUnit = unit || null;
  }

  const numMatch = rawPrice.match(/\d[\d\s]*(?:[.,]\d+)?/);
  if (numMatch) {
    const cleaned = numMatch[0].replace(/\s/g, '').replace(',', '.');
    const n = parseFloat(cleaned);
    if (Number.isFinite(n)) result.normalizedPrice = n;
  }

  return result;
}

export function detectListingType(messageTypeText, fallbackText = '') {
  const t = cleanText(messageTypeText).toLowerCase();
  if (t.includes('куплю')) return 'куплю';
  if (t.includes('продам') || t.includes('продаж')) return 'продам';
  const f = String(fallbackText || '').toLowerCase();
  if (/kupl|купл/.test(f)) return 'куплю';
  if (/prodam|prodazh|продам|продаж/.test(f)) return 'продам';
  return null;
}

const LEGAL_TYPES = ['ТОВ', 'ТзОВ', 'ПрАТ', 'ПАТ', 'ПП', 'ФОП', 'АТ'];

export function parseSeller(raw) {
  const text = cleanText(raw);
  if (!text) return { name: null, type: null };
  const idx = text.lastIndexOf(',');
  if (idx === -1) return { name: text, type: null };
  const name = cleanText(text.slice(0, idx)) || null;
  const tail = cleanText(text.slice(idx + 1));
  let type = null;
  if (/самозайнят|приватн/i.test(tail)) type = 'приватна';
  else if (LEGAL_TYPES.some((t) => t.toUpperCase() === tail.toUpperCase())) type = tail.toUpperCase();
  else type = tail || null;
  return { name, type };
}

export function parseLocation(text, title = '') {
  const cleanT = cleanText(text);
  const cleanTitle = cleanText(title).replace(/,\s*$/, '');
  let city = null;
  let region = null;
  let country = 'UA';

  if (cleanT) {
    const parts = cleanT.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length) city = parts[0];
    const last = parts[parts.length - 1];
    if (last && /^[A-Z]{2}$/.test(last)) country = last;
  }
  if (cleanTitle) {
    const tparts = cleanTitle.split(',').map((s) => s.trim()).filter(Boolean);
    if (!city && tparts[0]) city = tparts[0];
    if (tparts[1]) region = tparts[1];
  }

  return { city: city || null, region: region || null, country };
}

export function parseJsonLd($) {
  const out = { product: null, breadcrumb: null };
  $('script[type="application/ld+json"]').each((_, el) => {
    const txt = $(el).contents().text() || $(el).text();
    if (!txt) return;
    let data;
    try { data = JSON.parse(txt); } catch { return; }
    const nodes = Array.isArray(data) ? data : [data];
    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue;
      if (node['@type'] === 'Product' && !out.product) out.product = node;
      if (node['@type'] === 'BreadcrumbList' && !out.breadcrumb) out.breadcrumb = node;
    }
  });
  return out;
}

export function categoryFromBreadcrumb(breadcrumb) {
  if (!breadcrumb || !Array.isArray(breadcrumb.itemListElement)) return null;
  const names = breadcrumb.itemListElement
    .map((li) => li?.item?.name || li?.name)
    .filter(Boolean);
  if (!names.length) return null;
  return names[names.length - 1];
}
