import { selectors } from './selectors.js';

/** Нормалізує телефон до "+380XXXXXXXXX" (лише + і цифри). null якщо не схоже на номер. */
export function normalizePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/[^\d+]/g, '');
  const m = digits.match(/\+?\d{10,15}/);
  return m ? m[0] : null;
}

/**
 * Дістає телефони продавця з уже завантаженого DOM detail-сторінки.
 * Телефон присутній у статичному HTML (GATE №0 = GO, підхід A) — окремий запит не потрібен.
 * @returns {{phones: string[], status: 'found'|'hidden'|'failed'|'disabled'}}
 */
export function extractPhones($, opts = {}) {
  if (opts.fetchPhones === false) return { phones: [], status: 'disabled' };
  try {
    const nodes = $(selectors.detail.phones);
    if (!nodes.length) return { phones: [], status: 'hidden' };
    const phones = [];
    const seen = new Set();
    nodes.each((_, el) => {
      const href = ($(el).attr('href') || '').replace(/^tel:/i, '');
      const norm = normalizePhone(href || $(el).text());
      if (norm && !seen.has(norm)) { seen.add(norm); phones.push(norm); }
    });
    if (!phones.length) return { phones: [], status: 'hidden' };
    return { phones, status: 'found' };
  } catch {
    return { phones: [], status: 'failed' };
  }
}
