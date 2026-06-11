import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { load } from 'cheerio';
import { parseNextPageUrl } from '../src/routes.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const loadFixture = (name) => load(readFileSync(join(HERE, 'fixtures', name), 'utf8'));
const BASE = 'https://flagma.ua/uk/products/q=%D0%BC%D0%B5%D1%82%D0%B0%D0%BB%D0%BB%D0%BE%D0%BF%D1%80%D0%BE%D0%BA%D0%B0%D1%82/';

test('parseNextPageUrl: повертає абсолютний URL наступної сторінки', () => {
  const $ = loadFixture('list-page.html');
  const next = parseNextPageUrl($, BASE);
  assert.ok(next, 'наступна сторінка існує');
  assert.match(next, /\/page-2\/$/);
  assert.match(next, /^https:\/\//, 'URL абсолютний');
});

test('parseNextPageUrl: остання/неіснуюча сторінка → null (краулер зупиняється)', () => {
  const $ = loadFixture('last-page.html');
  assert.equal(parseNextPageUrl($, BASE), null);
});
