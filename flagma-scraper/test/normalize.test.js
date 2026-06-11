import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractId } from '../src/normalize.js';

test('extractId: дістає числовий суфікс -o<digits>.html', () => {
  assert.equal(extractId('https://flagma.ua/uk/metalloprokat-o8548672.html'), '8548672');
  assert.equal(extractId('https://flagma.ua/uk/kupliu-r6m5-r18-r-9-lom-metalloprokat-o15059104.html'), '15059104');
  assert.equal(extractId('https://flagma.ua/uk/metalloprokat-truby-shveller-ugolok-balki-o14017986.html'), '14017986');
});

test('extractId: ігнорує query/hash після .html', () => {
  assert.equal(extractId('https://flagma.ua/uk/x-o123.html?ref=1'), '123');
  assert.equal(extractId('https://flagma.ua/uk/x-o123.html#top'), '123');
});

test('extractId: повертає null, коли патерну немає', () => {
  assert.equal(extractId('https://flagma.ua/uk/about-us'), null);
  assert.equal(extractId(''), null);
  assert.equal(extractId(null), null);
});

import { cleanText, parsePrice } from '../src/normalize.js';

test('cleanText: нормалізує пробіли, NBSP, переноси', () => {
  assert.equal(cleanText('  Металлопрокат,\n великий   асортимент '), 'Металлопрокат, великий асортимент');
  assert.equal(cleanText('a b'), 'a b');
  assert.equal(cleanText(null), '');
});

test('parsePrice: число + валюта + одиниця', () => {
  assert.deepEqual(parsePrice('30 грн/штука'), {
    rawPrice: '30 грн/штука', normalizedPrice: 30, currency: 'UAH', priceUnit: 'штука',
  });
  assert.deepEqual(parsePrice('300 грн/кг'), {
    rawPrice: '300 грн/кг', normalizedPrice: 300, currency: 'UAH', priceUnit: 'кг',
  });
});

test('parsePrice: пробіл як роздільник тисяч + долар', () => {
  assert.deepEqual(parsePrice('2 800 $/шт'), {
    rawPrice: '2 800 $/шт', normalizedPrice: 2800, currency: 'USD', priceUnit: 'шт',
  });
});

test('parsePrice: десяткова кома/крапка + тонна', () => {
  assert.deepEqual(parsePrice('1.70 грн/т'), {
    rawPrice: '1.70 грн/т', normalizedPrice: 1.7, currency: 'UAH', priceUnit: 'т',
  });
  assert.equal(parsePrice('1,70 грн/т').normalizedPrice, 1.7);
});

test('parsePrice: нечислова ціна → normalizedPrice null, rawPrice збережено', () => {
  assert.deepEqual(parsePrice('Договірна'), {
    rawPrice: 'Договірна', normalizedPrice: null, currency: null, priceUnit: null,
  });
  assert.deepEqual(parsePrice(''), {
    rawPrice: null, normalizedPrice: null, currency: null, priceUnit: null,
  });
});

test('parsePrice: євро', () => {
  assert.equal(parsePrice('500 €/шт').currency, 'EUR');
});

import { detectListingType, parseSeller, parseLocation } from '../src/normalize.js';

test('detectListingType: пряма мітка має пріоритет', () => {
  assert.equal(detectListingType('Куплю', 'будь-що'), 'куплю');
  assert.equal(detectListingType('Продам', 'будь-що'), 'продам');
});

test('detectListingType: fallback-евристика по URL/slug', () => {
  assert.equal(detectListingType('', 'https://flagma.ua/uk/kupliu-r6m5-lom-o1.html'), 'куплю');
  assert.equal(detectListingType('', 'https://flagma.ua/uk/prodam-metalloprokat-o2.html'), 'продам');
});

test('detectListingType: неоднозначно → null', () => {
  assert.equal(detectListingType('', 'https://flagma.ua/uk/metalloprokat-optom-o3.html'), null);
  assert.equal(detectListingType('', ''), null);
});

test('parseSeller: "Назва, ТИП" → {name, type}', () => {
  assert.deepEqual(parseSeller('Вышка, ТОВ'), { name: 'Вышка', type: 'ТОВ' });
  assert.deepEqual(parseSeller('Миголь А., ФОП'), { name: 'Миголь А.', type: 'ФОП' });
});

test('parseSeller: "Самозайнята особа" → приватна', () => {
  assert.deepEqual(parseSeller('Металоріжущий завод, Самозайнята особа'), {
    name: 'Металоріжущий завод', type: 'приватна',
  });
});

test('parseSeller: без коми → лише name', () => {
  assert.deepEqual(parseSeller('Іван'), { name: 'Іван', type: null });
  assert.deepEqual(parseSeller(''), { name: null, type: null });
});

test('parseLocation: текст + title → city/region/country', () => {
  assert.deepEqual(parseLocation('Черкаси, UA', 'Черкаси, Черкаська область, '), {
    city: 'Черкаси', region: 'Черкаська область', country: 'UA',
  });
});

test('parseLocation: без title → country дефолт UA', () => {
  assert.deepEqual(parseLocation('Київ, UA', ''), { city: 'Київ', region: null, country: 'UA' });
  assert.deepEqual(parseLocation('', ''), { city: null, region: null, country: 'UA' });
});
