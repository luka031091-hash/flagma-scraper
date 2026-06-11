import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { load } from 'cheerio';
import { parseListingLinks } from '../src/routes.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const loadFixture = (name) => load(readFileSync(join(HERE, 'fixtures', name), 'utf8'));
const BASE = 'https://flagma.ua/uk/products/q=%D0%BC%D0%B5%D1%82%D0%B0%D0%BB%D0%BB%D0%BE%D0%BF%D1%80%D0%BE%D0%BA%D0%B0%D1%82/';

test('parseListingLinks: дістає всі картки списку з url+id', () => {
  const $ = loadFixture('list-page.html');
  const links = parseListingLinks($, BASE);
  assert.equal(links.length, 20, 'на сторінці пошуку 20 оголошень');
  for (const link of links) {
    assert.match(link.url, /^https:\/\/flagma\.ua\/uk\/.*-o\d+\.html$/);
    assert.match(link.id, /^\d+$/);
  }
});

test('parseListingLinks: без дублікатів, без реклами (усі мають числовий id)', () => {
  const $ = loadFixture('list-page.html');
  const links = parseListingLinks($, BASE);
  const ids = links.map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length, 'id унікальні');
  assert.ok(ids.every((id) => /^\d+$/.test(id)), 'жодної рекламної картки без id');
});
