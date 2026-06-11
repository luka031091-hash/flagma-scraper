import { createCheerioRouter, Dataset } from 'crawlee';
import { selectors } from './selectors.js';
import {
  extractId, cleanText, parsePrice, detectListingType, parseSeller,
  parseLocation, parseJsonLd, categoryFromBreadcrumb,
} from './normalize.js';
import { extractPhones } from './phone.js';

/**
 * Дістає посилання на оголошення зі сторінки списку.
 * Фільтрує рекламні картки. Дедуплікує за id (fallback — url).
 * @returns {{url: string, id: string|null}[]}
 */
export function parseListingLinks($, baseUrl) {
  const links = [];
  const seen = new Set();
  $(selectors.list.card).each((_, el) => {
    const $card = $(el);
    if ($card.is(selectors.list.adMarker) || $card.find('.adsbygoogle').length) return;
    const href = $card.find(selectors.list.cardLink).first().attr('href');
    if (!href) return;
    let url;
    try { url = new URL(href, baseUrl).href; } catch { return; }
    const id = extractId(url);
    const key = id || url;
    if (seen.has(key)) return;
    seen.add(key);
    links.push({ url, id });
  });
  return links;
}

/**
 * URL наступної сторінки пагінації, або null якщо це остання сторінка.
 * Джерело — <link rel="next"> у <head> (зникає на останній сторінці).
 */
export function parseNextPageUrl($, baseUrl) {
  const href = $(selectors.list.nextPage).attr('href');
  if (!href) return null;
  try { return new URL(href, baseUrl).href; } catch { return null; }
}

/**
 * Парсить сторінку оголошення в повний запис датасету.
 * Стратегія: JSON-LD (Schema.org Product/BreadcrumbList) як основне джерело,
 * CSS — fallback і для полів, яких немає в JSON-LD.
 * Повертає null, якщо немає критичного поля title (хендлер пропускає лот).
 * scrapedAt і sourceStartUrl додаються в хендлері (потребують Date/userData).
 */
export function parseDetail($, url, opts = {}) {
  const { product, breadcrumb } = parseJsonLd($);

  const title = cleanText(product?.name) || cleanText($(selectors.detail.title).first().text()) || null;
  if (!title) return null;

  const description = cleanText(product?.description)
    || cleanText($(selectors.detail.description).text())
    || null;

  const price = parsePrice($(selectors.detail.priceBlock).first().text());
  const offer = Array.isArray(product?.offers) ? product.offers[0] : product?.offers;
  if (offer) {
    const n = Number(offer.price);
    if (offer.price != null && Number.isFinite(n)) price.normalizedPrice = n;
    if (offer.priceCurrency) price.currency = offer.priceCurrency;
  }

  const listingType = detectListingType($(selectors.detail.listingType).first().text(), url);
  const seller = parseSeller($(selectors.detail.sellerInfo).first().text());

  const $terr = $(selectors.detail.location).first();
  const location = parseLocation($terr.text(), $terr.attr('title') || '');

  const images = [];
  const seenImg = new Set();
  $(selectors.detail.images).each((_, el) => {
    const src = $(el).attr('src');
    if (!src) return;
    let abs;
    try { abs = new URL(src, url).href; } catch { return; }
    if (!seenImg.has(abs)) { seenImg.add(abs); images.push(abs); }
  });
  if (!images.length && product?.image) {
    const imgs = Array.isArray(product.image) ? product.image : [product.image];
    imgs.forEach((s) => { if (s) images.push(s); });
  }

  const publishedAt = cleanText($(selectors.detail.updated).find('span').first().text()) || null;
  const phoneResult = extractPhones($, opts);

  return {
    id: extractId(url) || url,
    url,
    listingType,
    title,
    description,
    rawPrice: price.rawPrice,
    normalizedPrice: price.normalizedPrice,
    currency: price.currency,
    priceUnit: price.priceUnit,
    category: categoryFromBreadcrumb(breadcrumb),
    seller,
    location,
    phone: phoneResult.phones[0] || null,
    phoneStatus: phoneResult.status,
    images,
    publishedAt,
  };
}

/**
 * Будує роутер LIST/DETAIL.
 * @param {object} opts
 * @param {boolean} opts.fetchPhones
 * @param {() => boolean} opts.isLimitReached
 * @param {() => void} opts.onPushed
 */
export function buildRouter(opts) {
  const router = createCheerioRouter();

  const handleList = async ({ $, request, crawler, log }) => {
    if (opts.isLimitReached()) return;
    const baseUrl = request.loadedUrl || request.url;
    const sourceStartUrl = request.userData.sourceStartUrl || baseUrl;

    const links = parseListingLinks($, baseUrl);
    const detailRequests = links.map(({ url, id }) => ({
      url,
      label: 'DETAIL',
      uniqueKey: id || url,                 // дедуплікація за id (спека §7)
      userData: { sourceStartUrl },
    }));
    await crawler.addRequests(detailRequests);

    const next = parseNextPageUrl($, baseUrl);
    if (next) {
      await crawler.addRequests([{ url: next, label: 'LIST', userData: { sourceStartUrl } }]);
    }
    log.info(`LIST ${baseUrl}: ${links.length} лотів, next=${Boolean(next)}`);
  };

  const handleDetail = async ({ $, request, log }) => {
    if (opts.isLimitReached()) return;
    const url = request.loadedUrl || request.url;
    const record = parseDetail($, url, { fetchPhones: opts.fetchPhones });
    if (!record) {
      log.warning(`Пропуск (немає title): ${url}`);
      return;
    }
    record.sourceStartUrl = request.userData.sourceStartUrl || null;
    record.scrapedAt = new Date().toISOString();
    await Dataset.pushData(record);
    opts.onPushed();
    if (record.phoneStatus === 'failed') log.warning(`Телефон не отримано: ${url}`);
  };

  router.addHandler('LIST', handleList);
  router.addHandler('DETAIL', handleDetail);
  router.addDefaultHandler(handleList); // захист: будь-який немаркований запит → LIST
  return router;
}
