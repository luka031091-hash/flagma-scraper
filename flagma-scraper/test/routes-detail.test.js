import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { load } from 'cheerio';
import { parseJsonLd, categoryFromBreadcrumb } from '../src/normalize.js';

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
