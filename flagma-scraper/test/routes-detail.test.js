import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { load } from 'cheerio';
import { parseJsonLd, categoryFromBreadcrumb } from '../src/normalize.js';
import { parseDetail } from '../src/routes.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const loadFixture = (name) => load(readFileSync(join(HERE, 'fixtures', name), 'utf8'));

test('parseJsonLd: дістає Product і BreadcrumbList з detail-сторінки', () => {
  const $ = loadFixture('detail-page.html');
  const { product, breadcrumb } = parseJsonLd($);
  assert.ok(product, 'Product має бути знайдений');
  assert.equal(product['@type'], 'Product');
  assert.match(product.name, /Металлопрокат/);
  assert.ok(product.offers, 'offers присутні');
  assert.ok(breadcrumb, 'BreadcrumbList має бути знайдений');
  assert.equal(breadcrumb['@type'], 'BreadcrumbList');
});

test('categoryFromBreadcrumb: повертає найглибшу категорію', () => {
  const $ = loadFixture('detail-page.html');
  const { breadcrumb } = parseJsonLd($);
  assert.equal(categoryFromBreadcrumb(breadcrumb), 'Балки металеві, двотаври');
});

test('categoryFromBreadcrumb: null при відсутності даних', () => {
  assert.equal(categoryFromBreadcrumb(null), null);
  assert.equal(categoryFromBreadcrumb({ itemListElement: [] }), null);
});

const DETAIL_URL = 'https://flagma.ua/uk/metalloprokat-truby-shveller-ugolok-balki-o14017986.html';

test('parseDetail: збирає повний запис із detail-сторінки', () => {
  const $ = loadFixture('detail-page.html');
  const rec = parseDetail($, DETAIL_URL, { fetchPhones: true });

  assert.equal(rec.id, '14017986');
  assert.equal(rec.url, DETAIL_URL);
  assert.match(rec.title, /Металлопрокат/);
  assert.ok(rec.description && rec.description.length > 10);
  assert.equal(rec.listingType, 'куплю');
  assert.equal(rec.normalizedPrice, 30);
  assert.equal(rec.currency, 'UAH');
  assert.ok(rec.rawPrice && rec.rawPrice.includes('30'));
  assert.equal(rec.category, 'Балки металеві, двотаври');
  assert.deepEqual(rec.seller, { name: 'Вышка', type: 'ТОВ' });
  assert.equal(rec.location.city, 'Черкаси');
  assert.equal(rec.location.region, 'Черкаська область');
  assert.equal(rec.location.country, 'UA');
  assert.ok(Array.isArray(rec.images) && rec.images.length >= 1);
  assert.ok(rec.images.every((u) => u.startsWith('http')));
  assert.equal(rec.phoneStatus, 'found');
  assert.match(rec.phone, /^\+?\d{10,15}$/);
  assert.ok(rec.publishedAt, 'publishedAt не порожній');
  assert.equal(rec.scrapedAt, undefined);
});

test('parseDetail: fetchPhones=false → phoneStatus disabled, phone null', () => {
  const $ = loadFixture('detail-page.html');
  const rec = parseDetail($, DETAIL_URL, { fetchPhones: false });
  assert.equal(rec.phoneStatus, 'disabled');
  assert.equal(rec.phone, null);
});

test('parseDetail: без title → null (лот пропускається в хендлері)', () => {
  const $ = load('<html><body><div class="price">100 грн</div></body></html>');
  assert.equal(parseDetail($, 'https://flagma.ua/uk/x-o1.html', {}), null);
});

test('parseDetail: другий лот має listingType "продам"', () => {
  const $ = loadFixture('detail-page-2.html');
  const rec = parseDetail($, 'https://flagma.ua/uk/prodam-metalloprokat-so-sklada-dnepr-harkov-o8005180.html', { fetchPhones: true });
  assert.equal(rec.listingType, 'продам');
});
