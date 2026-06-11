import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { load } from 'cheerio';
import { normalizePhone, extractPhones } from '../src/phone.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const loadFixture = (name) => load(readFileSync(join(HERE, 'fixtures', name), 'utf8'));

test('normalizePhone: лишає + і цифри', () => {
  assert.equal(normalizePhone('+380 (95) 022-77-70'), '+380950227770');
  assert.equal(normalizePhone('tel:+380 (67) 418-36-18'.replace(/^tel:/, '')), '+380674183618');
  assert.equal(normalizePhone(''), null);
  assert.equal(normalizePhone('---'), null);
});

test('extractPhones: дістає телефони продавця зі статичного HTML → found', () => {
  const $ = loadFixture('detail-page.html');
  const res = extractPhones($, { fetchPhones: true });
  assert.equal(res.status, 'found');
  assert.ok(res.phones.length >= 1);
  assert.ok(res.phones.every((p) => /^\+?\d{10,15}$/.test(p)), 'усі номери нормалізовані');
});

test('extractPhones: працює і на другому оголошенні', () => {
  const $ = loadFixture('detail-page-2.html');
  const res = extractPhones($, { fetchPhones: true });
  assert.equal(res.status, 'found');
  assert.ok(res.phones.length >= 1);
});

test('extractPhones: fetchPhones=false → disabled, без номерів', () => {
  const $ = loadFixture('detail-page.html');
  const res = extractPhones($, { fetchPhones: false });
  assert.deepEqual(res, { phones: [], status: 'disabled' });
});

test('extractPhones: немає блоку телефону → hidden', () => {
  const $ = load('<html><body><div class="desc">без контактів</div></body></html>');
  const res = extractPhones($, { fetchPhones: true });
  assert.equal(res.status, 'hidden');
  assert.deepEqual(res.phones, []);
});
