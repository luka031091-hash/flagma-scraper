import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { load } from 'cheerio';
import { parseListingLinks, filterLinksByType } from '../src/routes.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const loadFixture = (name) => load(readFileSync(join(HERE, 'fixtures', name), 'utf8'));
const BASE = 'https://flagma.ua/uk/products/q=%D0%BC%D0%B5%D1%82%D0%B0%D0%BB%D0%BB%D0%BE%D0%BF%D1%80%D0%BE%D0%BA%D0%B0%D1%82/';

test('parseListingLinks: кожна картка має type "куплю" або "продам"', () => {
  const $ = loadFixture('list-page.html');
  const links = parseListingLinks($, BASE);
  assert.ok(links.length > 0);
  for (const link of links) {
    assert.ok(['куплю', 'продам'].includes(link.type), `type = ${link.type}`);
  }
});

test('parseListingLinks: бейдж "Куплю" на картці → type "куплю"', () => {
  const $ = loadFixture('list-page.html');
  const links = parseListingLinks($, BASE);
  const buy = links.filter((l) => l.type === 'куплю');
  const sell = links.filter((l) => l.type === 'продам');
  // у fixture є і куплю-картки (з бейджем), і продам-картки (без бейджа)
  assert.ok(buy.length > 0, 'є хоча б одна картка "куплю"');
  assert.ok(sell.length > 0, 'є хоча б одна картка "продам"');
  assert.equal(buy.length + sell.length, links.length);
});

test('filterLinksByType: buy → лише "куплю"', () => {
  const links = [
    { url: 'a', id: '1', type: 'куплю' },
    { url: 'b', id: '2', type: 'продам' },
    { url: 'c', id: '3', type: 'куплю' },
  ];
  const out = filterLinksByType(links, 'buy');
  assert.equal(out.length, 2);
  assert.ok(out.every((l) => l.type === 'куплю'));
});

test('filterLinksByType: sell → лише "продам"', () => {
  const links = [
    { url: 'a', id: '1', type: 'куплю' },
    { url: 'b', id: '2', type: 'продам' },
  ];
  const out = filterLinksByType(links, 'sell');
  assert.equal(out.length, 1);
  assert.equal(out[0].type, 'продам');
});

test('filterLinksByType: all (або невідоме) → без фільтра', () => {
  const links = [
    { url: 'a', id: '1', type: 'куплю' },
    { url: 'b', id: '2', type: 'продам' },
  ];
  assert.equal(filterLinksByType(links, 'all').length, 2);
  assert.equal(filterLinksByType(links, undefined).length, 2);
  assert.equal(filterLinksByType(links, 'щось').length, 2);
});
