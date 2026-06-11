# Flagma Scraper — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Самостійний Apify-актор `flagma-scraper`, що скрейпить оголошення з Flagma.ua за заданими URL і складає чистий структурований датасет (лише збір даних, без арбітражної логіки).

**Architecture:** Crawlee `CheerioCrawler` (HTTP, без браузера) з двофазним краулом через роутер: `LIST` (картки → черга `DETAIL` + наступна сторінка) і `DETAIL` (усі поля + телефон → запис у dataset). Парсинг DETAIL: **JSON-LD first** (Schema.org `Product`/`BreadcrumbList`, наявний на сторінці) з **CSS-fallback** для решти полів. Селектори централізовані в одному модулі. Чиста логіка (нормалізація, id, телефон) винесена в тестовані функції без мережі.

**Tech Stack:** Node.js (ESM), Apify SDK (`apify`), Crawlee (`crawlee` + `cheerio`), вбудований тест-раннер `node:test` + `node:assert/strict` (без зайвих залежностей).

---

## Розвідка: перевірені факти (живий сайт, 2026-06-11)

Ці факти перевірені реальними HTTP-запитами до Flagma.ua на **4 оголошеннях різних типів** і знімають ключові невизначеності спеки. Вони закладені в селектори й тести нижче.

- **Антибота для curl немає** (HTTP 200, повний HTML без JS).
- **DETAIL URL / id:** патерн `…-o<DIGITS>.html` у кінці URL → `id` = `<DIGITS>` (напр. `…-o14017986.html` → `14017986`). Дублюється в DOM: `.updated ._id` = `ID: 14017986`.
- **LIST URL:** `/uk/products/q=<term>/`, `/uk/products/<category>/`, `/uk/products/<city>/q=<term>/`.
- **Пагінація:** у `<head>` є `<link rel="next" href="…/page-2/">`; на останній/неіснуючій сторінці `rel="next"` **відсутній** → природний критерій зупинки.
- **Картка списку:** `#message-list .page-list-item` (рекламні мають додатковий клас `.google-ads` — фільтрувати). Посилання на оголошення: `a.photo[href]` і `.page-list-item-header a[href]`. На сторінці пошуку — 20 карток.
- **Тип оголошення:** пряма мітка `.message-type` ("Куплю"/"Продам") і на картці, і на DETAIL (`.desc-block .message-type`).
- **DETAIL має JSON-LD** `script[type="application/ld+json"]`:
  - `@type:"Product"` → `name`, `description`, `image`, `offers.price`, `offers.priceCurrency`.
  - `@type:"BreadcrumbList"` → `itemListElement[].item.name` (перший — місто, далі — категорії; найглибша = точна категорія).
- **Ціна (CSS):** `.retail-price` = текст `30 грн/штука`, всередині `[itemprop="price"][content]`, `[itemprop="priceCurrency"][content]`, `.price-unit`.
- **Продавець:** `#company-data .company-info > a span` = `Вышка, ТОВ` (формат `Назва, ТИП`). Локація: `#company-data .company-info .terr`, текст `Черкаси, UA`, атрибут `title="Черкаси, Черкаська область, "`.
- **Фото:** `.small-photos-block img[src]` (мініатюри); велике — `.big-photo #bf[src]`; fallback — JSON-LD `image`.
- **Дата:** `.header-price-container .updated span` (перший) = `27 жовтня 2023, 00:02` (мітка «Оновлено»).
- **🔑 ТЕЛЕФОН (GATE №0 → GO):** номери продавця присутні **у статичному HTML** detail-сторінки в `#contactDialog .phones a.tel` (напр. `tel:+380 (95) 022-77-70`). Підтверджено на 4/4 оголошеннях. **Окремий HTTP-reveal-запит не потрібен** — телефон у тому самому DOM, що ми вже завантажуємо для DETAIL.

---

## File Structure

Актор живе в підпапці `flagma-scraper/` у корені репозиторію. Кожен файл — одна відповідальність.

```
flagma-scraper/
├── .actor/
│   ├── actor.json              # метадані актора (назва, версія, посилання на схеми)
│   ├── INPUT_SCHEMA.json       # вхідна схема (UI Apify)
│   └── dataset_schema.json     # output schema (Task 12, генерується skill-ом)
├── src/
│   ├── main.js                 # вхід: читає Input, конфігурує краулер, запускає
│   ├── routes.js               # хендлери LIST/DETAIL + чисті парс-функції (parseListingLinks, parseNextPageUrl, parseDetail)
│   ├── phone.js                # extractPhones($), normalizePhone() — знання про блок телефону
│   ├── selectors.js            # УСІ CSS-селектори в одному місці
│   └── normalize.js            # extractId, parsePrice, detectListingType, parseSeller, parseLocation, parseJsonLd, categoryFromBreadcrumb, cleanText
├── test/
│   ├── fixtures/               # збережені реальні HTML (Task 0)
│   │   ├── list-page.html
│   │   ├── last-page.html
│   │   ├── detail-page.html
│   │   └── detail-page-2.html
│   ├── normalize.test.js
│   ├── routes-list.test.js
│   ├── routes-detail.test.js
│   ├── pagination.test.js
│   └── phone.test.js
├── scripts/
│   └── gate0-phone-probe.mjs   # GATE №0: прототип перевірки телефону
├── package.json
└── README.md
```

**Чому так:** `selectors.js` ізолює крихкі CSS-селектори (зміна розмітки → правка одного файлу). `normalize.js` — чиста логіка без мережі/DOM-залежностей, повністю покрита TDD. `phone.js` — єдине місце знань про те, де лежить телефон. Парс-функції в `routes.js` приймають `$` (cheerio) і повертають дані, тому тестуються на фікстурах без запуску краулера; хендлери — тонкі обгортки, що додають мережеві/побічні ефекти (`scrapedAt`, `sourceStartUrl`, push у dataset).

---

## Task 0: GATE №0 — прототип reveal телефону (go/no-go) + фікстури

**Мета:** формалізувати критерій успіху №1 спеки — підтвердити на вибірці 10–20 оголошень, що телефон дістається HTTP-запитом без логіну/капчі (≥80%). Принагідно зберегти реальні HTML-фікстури для всіх подальших тестів.

**Files:**
- Create: `flagma-scraper/scripts/gate0-phone-probe.mjs`
- Create (фікстури): `flagma-scraper/test/fixtures/{list-page,last-page,detail-page,detail-page-2}.html`

- [ ] **Step 1: Створити каркас папок і зберегти фікстури з живого сайту**

Реальні URL нижче перевірені робочими 2026-06-11 (HTTP 200).

```bash
mkdir -p flagma-scraper/scripts flagma-scraper/test/fixtures flagma-scraper/src
cd flagma-scraper
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
# сторінка списку (пошук "металлопрокат")
curl -sS -L -A "$UA" -o test/fixtures/list-page.html "https://flagma.ua/uk/products/q=%D0%BC%D0%B5%D1%82%D0%B0%D0%BB%D0%BB%D0%BE%D0%BF%D1%80%D0%BE%D0%BA%D0%B0%D1%82/"
# остання/неіснуюча сторінка (для тесту зупинки пагінації — без rel=next)
curl -sS -L -A "$UA" -o test/fixtures/last-page.html "https://flagma.ua/uk/products/q=%D0%BC%D0%B5%D1%82%D0%B0%D0%BB%D0%BB%D0%BE%D0%BF%D1%80%D0%BE%D0%BA%D0%B0%D1%82/page-999/"
# дві детальні сторінки (різні типи: "Куплю" і "Продам")
curl -sS -L -A "$UA" -o test/fixtures/detail-page.html "https://flagma.ua/uk/metalloprokat-truby-shveller-ugolok-balki-o14017986.html"
curl -sS -L -A "$UA" -o test/fixtures/detail-page-2.html "https://flagma.ua/uk/prodam-metalloprokat-so-sklada-dnepr-harkov-o8005180.html"
ls -la test/fixtures/
```
Expected: 4 файли по ~240–300 KB кожен.

- [ ] **Step 2: Написати GATE-probe скрипт**

Create `flagma-scraper/scripts/gate0-phone-probe.mjs`:

```js
// GATE №0: перевіряє, що телефон продавця присутній у СТАТИЧНОМУ HTML detail-сторінки
// (без логіну/капчі/JS). Використовує вбудований fetch (Node 18+).
const SAMPLE = process.argv.slice(2);
if (!SAMPLE.length) {
  console.error('Usage: node scripts/gate0-phone-probe.mjs <detailUrl> [detailUrl...]');
  process.exit(1);
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const PHONE_RE = /<a[^>]*class=['"]tel['"][^>]*href=['"]tel:([^'"]+)['"]/gi;

let withPhone = 0;
for (const url of SAMPLE) {
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA } });
    const html = await res.text();
    const inDialog = /id=["']contactDialog["']/.test(html);
    const phones = [...html.matchAll(PHONE_RE)].map((m) => m[1].replace(/[^\d+]/g, ''));
    const ok = inDialog && phones.length > 0;
    if (ok) withPhone += 1;
    console.log(`${ok ? 'OK ' : 'NO '} ${url} → ${phones.slice(0, 3).join(', ') || '—'}`);
  } catch (e) {
    console.log(`ERR ${url} → ${e.message}`);
  }
}

const ratio = SAMPLE.length ? withPhone / SAMPLE.length : 0;
const verdict = ratio >= 0.8 ? 'GO (підхід A — телефон у статичному HTML)' : 'NO-GO → підхід B (PlaywrightCrawler, реальний клік)';
console.log(`\nРезультат: ${withPhone}/${SAMPLE.length} (${(ratio * 100).toFixed(0)}%) → ${verdict}`);
```

- [ ] **Step 3: Запустити GATE на 15 оголошеннях зі збереженої сторінки списку**

Run:
```bash
cd flagma-scraper
node scripts/gate0-phone-probe.mjs $(grep -oE 'https://flagma\.ua/uk/[^"]*-o[0-9]+\.html' test/fixtures/list-page.html | sort -u | head -15)
```
Expected: рядок-вердикт `Результат: NN/15 (≥80%) → GO (підхід A …)`.

- [ ] **Step 4: Зафіксувати рішення**

- **Якщо GO (очікувано, бо розвідка вже дала 4/4):** продовжуємо план як є — `phone.js` парсить телефон із DOM detail-сторінки (без окремого запиту).
- **Якщо NO-GO (<80%):** ЗУПИНИТИСЬ і повернутись до автора плану. Перехід на PlaywrightCrawler змінює стек (Task 1, 8, 9) — не реалізовувати наосліп. Це окреме рішення (спека §8, «Частковий випадок»).

- [ ] **Step 5: Commit**

```bash
cd flagma-scraper
git add scripts/gate0-phone-probe.mjs test/fixtures/
git commit -m "chore(flagma): GATE №0 phone probe + HTML fixtures"
```

---

## Task 1: Скелет актора (Apify + Crawlee + node:test)

**Files:**
- Create: `flagma-scraper/package.json`
- Create: `flagma-scraper/.actor/actor.json`
- Create: `flagma-scraper/.actor/INPUT_SCHEMA.json`
- Create: `flagma-scraper/README.md`

> Примітка: офіційний шаблон — `apify create flagma-scraper --template js-crawlee-cheerio`. Оскільки папка `flagma-scraper/` уже створена в Task 0 з фікстурами, тут ми створюємо файли скелета вручну (щоб не перезаписати фікстури), відтворюючи структуру того ж шаблону.

- [ ] **Step 1: package.json**

Create `flagma-scraper/package.json`:

```json
{
  "name": "flagma-scraper",
  "version": "0.1.0",
  "type": "module",
  "description": "Apify-актор для збору оголошень з Flagma.ua",
  "engines": { "node": ">=18" },
  "scripts": {
    "start": "node src/main.js",
    "test": "node --test"
  },
  "dependencies": {
    "apify": "^3.2.6",
    "crawlee": "^3.11.5",
    "cheerio": "^1.0.0"
  }
}
```

- [ ] **Step 2: .actor/actor.json**

Create `flagma-scraper/.actor/actor.json`:

```json
{
  "actorSpecification": 1,
  "name": "flagma-scraper",
  "title": "Flagma Scraper",
  "version": "0.1",
  "buildTag": "latest",
  "input": "./INPUT_SCHEMA.json",
  "dockerfile": "../Dockerfile",
  "storages": {
    "dataset": "./dataset_schema.json"
  }
}
```

> `dataset_schema.json` зʼявиться в Task 12. До того Apify ігнорує відсутнє посилання локально; не пушимо до Task 14.

- [ ] **Step 3: INPUT_SCHEMA.json**

Create `flagma-scraper/.actor/INPUT_SCHEMA.json`:

```json
{
  "title": "Flagma Scraper",
  "type": "object",
  "schemaVersion": 1,
  "properties": {
    "startUrls": {
      "title": "Стартові URL",
      "type": "array",
      "description": "Сторінки пошуку або категорій Flagma.ua (LIST). Напр. https://flagma.ua/uk/products/q=металлопрокат/",
      "editor": "requestListSources",
      "prefill": [{ "url": "https://flagma.ua/uk/products/q=%D0%BC%D0%B5%D1%82%D0%B0%D0%BB%D0%BB%D0%BE%D0%BF%D1%80%D0%BE%D0%BA%D0%B0%D1%82/" }]
    },
    "maxItems": {
      "title": "Ліміт лотів",
      "type": "integer",
      "description": "Максимум оголошень за запуск. 0 — без ліміту.",
      "default": 0,
      "minimum": 0
    },
    "maxRequestsPerMinute": {
      "title": "Запитів за хвилину",
      "type": "integer",
      "description": "Обмеження темпу (анти-бан).",
      "default": 60,
      "minimum": 1
    },
    "maxConcurrency": {
      "title": "Паралелізм",
      "type": "integer",
      "description": "Кількість одночасних запитів (анти-бан).",
      "default": 5,
      "minimum": 1
    },
    "fetchPhones": {
      "title": "Збирати телефони",
      "type": "boolean",
      "description": "Чи парсити телефон продавця. Вимкніть для збору без контактів.",
      "default": true
    },
    "proxyConfiguration": {
      "title": "Проксі",
      "type": "object",
      "description": "Конфігурація проксі (рекомендовано Apify Proxy).",
      "editor": "proxy",
      "default": { "useApifyProxy": true }
    }
  },
  "required": ["startUrls"]
}
```

- [ ] **Step 4: README.md (мінімальний)**

Create `flagma-scraper/README.md`:

```markdown
# Flagma Scraper

Apify-актор: збирає оголошення з Flagma.ua за заданими URL у структурований датасет.
Лише збір даних — без арбітражної логіки.

## Вхід
- `startUrls` — сторінки пошуку/категорій Flagma (обовʼязково)
- `maxItems`, `maxRequestsPerMinute`, `maxConcurrency`, `fetchPhones`, `proxyConfiguration`

## Запуск локально
```bash
npm install
apify run -i input.json
```

## Тести
```bash
npm test
```
```

- [ ] **Step 5: Встановити залежності й перевірити, що тест-раннер працює**

Run:
```bash
cd flagma-scraper && npm install && node --test
```
Expected: `npm install` без помилок; `node --test` завершується успішно з `# tests 0` (тестів ще немає) — підтверджує, що раннер працює.

- [ ] **Step 6: Commit**

```bash
cd flagma-scraper
git add package.json package-lock.json .actor/ README.md
git commit -m "feat(flagma): actor skeleton — package.json, INPUT_SCHEMA, actor.json"
```

---

## Task 2: normalize.js — `extractId` (виділення id з URL)

**Files:**
- Create: `flagma-scraper/src/normalize.js`
- Test: `flagma-scraper/test/normalize.test.js`

- [ ] **Step 1: Написати падаючий тест**

Create `flagma-scraper/test/normalize.test.js`:

```js
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
```

- [ ] **Step 2: Запустити — переконатися, що падає**

Run: `cd flagma-scraper && node --test test/normalize.test.js`
Expected: FAIL — `extractId` ще не експортується (`SyntaxError`/`does not provide an export named 'extractId'`).

- [ ] **Step 3: Мінімальна реалізація**

Create `flagma-scraper/src/normalize.js`:

```js
export function extractId(url) {
  if (!url || typeof url !== 'string') return null;
  const m = url.match(/-o(\d+)\.html(?:[?#]|$)/);
  return m ? m[1] : null;
}
```

- [ ] **Step 4: Запустити — переконатися, що проходить**

Run: `cd flagma-scraper && node --test test/normalize.test.js`
Expected: PASS — 3 тести.

- [ ] **Step 5: Commit**

```bash
cd flagma-scraper
git add src/normalize.js test/normalize.test.js
git commit -m "feat(flagma): extractId — id з URL оголошення"
```

---

## Task 3: normalize.js — `cleanText` + `parsePrice`

**Files:**
- Modify: `flagma-scraper/src/normalize.js`
- Modify: `flagma-scraper/test/normalize.test.js`

- [ ] **Step 1: Додати падаючі тести**

Append to `flagma-scraper/test/normalize.test.js`:

```js
import { cleanText, parsePrice } from '../src/normalize.js';

test('cleanText: нормалізує пробіли, NBSP, переноси', () => {
  assert.equal(cleanText('  Металлопрокат,\n великий   асортимент '), 'Металлопрокат, великий асортимент');
  assert.equal(cleanText('a b'), 'a b');
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
```

- [ ] **Step 2: Запустити — переконатися, що падає**

Run: `cd flagma-scraper && node --test test/normalize.test.js`
Expected: FAIL — `cleanText`/`parsePrice` не експортуються.

- [ ] **Step 3: Реалізувати**

Append to `flagma-scraper/src/normalize.js`:

```js
export function cleanText(s) {
  if (s == null) return '';
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

  // одиниця: текст після останнього "/", що не починається з цифри
  const unitMatch = rawPrice.match(/\/\s*([^\d\s/][^/]*)$/);
  if (unitMatch) {
    const unit = cleanText(unitMatch[1]).replace(/\.$/, '');
    result.priceUnit = unit || null;
  }

  // число: перша числова група (пробіли/NBSP — роздільники тисяч; кома/крапка — десяткові)
  const numMatch = rawPrice.match(/\d[\d\s]*(?:[.,]\d+)?/);
  if (numMatch) {
    const cleaned = numMatch[0].replace(/\s/g, '').replace(',', '.');
    const n = parseFloat(cleaned);
    if (Number.isFinite(n)) result.normalizedPrice = n;
  }

  return result;
}
```

- [ ] **Step 4: Запустити — переконатися, що проходить**

Run: `cd flagma-scraper && node --test test/normalize.test.js`
Expected: PASS — усі тести (Task 2 + Task 3).

- [ ] **Step 5: Commit**

```bash
cd flagma-scraper
git add src/normalize.js test/normalize.test.js
git commit -m "feat(flagma): cleanText + parsePrice (raw + normalized, валюта, одиниця)"
```

---

## Task 4: normalize.js — `detectListingType`, `parseSeller`, `parseLocation`

**Files:**
- Modify: `flagma-scraper/src/normalize.js`
- Modify: `flagma-scraper/test/normalize.test.js`

- [ ] **Step 1: Додати падаючі тести**

Append to `flagma-scraper/test/normalize.test.js`:

```js
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
```

- [ ] **Step 2: Запустити — переконатися, що падає**

Run: `cd flagma-scraper && node --test test/normalize.test.js`
Expected: FAIL — нові функції не експортуються.

- [ ] **Step 3: Реалізувати**

Append to `flagma-scraper/src/normalize.js`:

```js
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
```

- [ ] **Step 4: Запустити — переконатися, що проходить**

Run: `cd flagma-scraper && node --test test/normalize.test.js`
Expected: PASS — усі тести normalize.

- [ ] **Step 5: Commit**

```bash
cd flagma-scraper
git add src/normalize.js test/normalize.test.js
git commit -m "feat(flagma): detectListingType + parseSeller + parseLocation"
```

---

## Task 5: normalize.js — `parseJsonLd` + `categoryFromBreadcrumb`

**Files:**
- Modify: `flagma-scraper/src/normalize.js`
- Test: `flagma-scraper/test/routes-detail.test.js` (новий файл — використовує фікстуру)

- [ ] **Step 1: Написати падаючий тест на реальній фікстурі**

Create `flagma-scraper/test/routes-detail.test.js`:

```js
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
```

> Якщо точна назва найглибшої категорії у вашій фікстурі інша — звірте з `test/fixtures/detail-page.html` (`BreadcrumbList` JSON-LD, останній `itemListElement`) і підставте фактичне значення. На зафіксованій 2026-06-11 сторінці це `Балки металеві, двотаври`.

- [ ] **Step 2: Запустити — переконатися, що падає**

Run: `cd flagma-scraper && node --test test/routes-detail.test.js`
Expected: FAIL — `parseJsonLd`/`categoryFromBreadcrumb` не експортуються.

- [ ] **Step 3: Реалізувати**

Append to `flagma-scraper/src/normalize.js`:

```js
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
  // перший елемент — місто ("Оголошення в ..."); найглибша категорія — останній
  if (!names.length) return null;
  return names[names.length - 1];
}
```

- [ ] **Step 4: Запустити — переконатися, що проходить**

Run: `cd flagma-scraper && node --test test/routes-detail.test.js`
Expected: PASS — 3 тести.

- [ ] **Step 5: Commit**

```bash
cd flagma-scraper
git add src/normalize.js test/routes-detail.test.js
git commit -m "feat(flagma): parseJsonLd + categoryFromBreadcrumb (Schema.org)"
```

---

## Task 6: selectors.js — централізовані селектори

**Files:**
- Create: `flagma-scraper/src/selectors.js`

> Тестів тут немає — це декларативний модуль даних. Він перевіряється опосередковано тестами Task 7–10, які парсять реальні фікстури через ці селектори. Якщо тест парсера падає через порожній результат — першими підозрюй селектори тут.

- [ ] **Step 1: Створити модуль селекторів**

Create `flagma-scraper/src/selectors.js`:

```js
// Усі CSS-селектори Flagma.ua в одному місці.
// Значення перевірені на живому сайті 2026-06-11 (див. розвідку в плані).
// Зміна розмітки сайту → правити ТІЛЬКИ тут.
export const selectors = {
  list: {
    card: '#message-list .page-list-item',          // картка оголошення у списку
    adMarker: '.google-ads',                          // якщо картка має цей клас — це реклама, пропустити
    cardLink: 'a.photo[href], .page-list-item-header a[href]', // посилання на сторінку оголошення
    nextPage: 'link[rel="next"]',                     // наступна сторінка (head); відсутній → остання сторінка
  },
  detail: {
    title: 'h1',                                      // fallback (основне — JSON-LD name)
    listingType: '.desc-block .message-type',         // "Куплю"/"Продам"
    description: '#description',                       // fallback (основне — JSON-LD description)
    priceBlock: '.retail-price',                      // сирий текст ціни "30 грн/штука"
    priceUnit: '.retail-price .price-unit',           // одиниця "штука" (наразі парситься з тексту priceBlock)
    sellerInfo: '#company-data .company-info > a span', // "Вышка, ТОВ"
    location: '#company-data .company-info .terr',    // текст "Черкаси, UA" + title "Черкаси, Черкаська область, "
    images: '.small-photos-block img',                // мініатюри (src)
    imageBig: '.big-photo #bf',                       // велике фото (fallback)
    updated: '.header-price-container .updated',      // "Оновлено: <span>дата</span>"
    phones: '#contactDialog .phones a.tel',           // телефони продавця (у статичному HTML)
  },
};
```

- [ ] **Step 2: Перевірити, що модуль валідний (імпортується)**

Run: `cd flagma-scraper && node -e "import('./src/selectors.js').then(m => console.log(Object.keys(m.selectors)))"`
Expected: `[ 'list', 'detail' ]`

- [ ] **Step 3: Commit**

```bash
cd flagma-scraper
git add src/selectors.js
git commit -m "feat(flagma): selectors.js — централізовані CSS-селектори"
```

---

## Task 7: routes.js — LIST-парсер (`parseListingLinks`)

**Files:**
- Create: `flagma-scraper/src/routes.js`
- Create: `flagma-scraper/test/routes-list.test.js`

- [ ] **Step 1: Написати падаючий тест на фікстурі списку**

Create `flagma-scraper/test/routes-list.test.js`:

```js
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
```

- [ ] **Step 2: Запустити — переконатися, що падає**

Run: `cd flagma-scraper && node --test test/routes-list.test.js`
Expected: FAIL — `routes.js` не існує / `parseListingLinks` не експортується.

- [ ] **Step 3: Реалізувати парс-функцію (хендлери додамо в Task 10)**

Create `flagma-scraper/src/routes.js`:

```js
import { selectors } from './selectors.js';
import { extractId } from './normalize.js';

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
```

- [ ] **Step 4: Запустити — переконатися, що проходить**

Run: `cd flagma-scraper && node --test test/routes-list.test.js`
Expected: PASS — 2 тести.

- [ ] **Step 5: Commit**

```bash
cd flagma-scraper
git add src/routes.js test/routes-list.test.js
git commit -m "feat(flagma): parseListingLinks — картки списку → url+id, без реклами/дублів"
```

---

## Task 8: routes.js — пагінація (`parseNextPageUrl`) + тест зупинки

**Files:**
- Modify: `flagma-scraper/src/routes.js`
- Create: `flagma-scraper/test/pagination.test.js`

- [ ] **Step 1: Написати падаючий тест (наступна сторінка + зупинка на останній)**

Create `flagma-scraper/test/pagination.test.js`:

```js
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
```

> Гарантія «не зациклюється»: краулер додає наступний `LIST` лише коли `parseNextPageUrl` повертає не-null. На останній сторінці він повертає `null` → нових `LIST`-запитів немає. Дублікати додатково відсікає `RequestQueue` (uniqueKey за URL).

- [ ] **Step 2: Запустити — переконатися, що падає**

Run: `cd flagma-scraper && node --test test/pagination.test.js`
Expected: FAIL — `parseNextPageUrl` не експортується.

- [ ] **Step 3: Реалізувати**

Append to `flagma-scraper/src/routes.js`:

```js
/**
 * URL наступної сторінки пагінації, або null якщо це остання сторінка.
 * Джерело — <link rel="next"> у <head> (зникає на останній сторінці).
 */
export function parseNextPageUrl($, baseUrl) {
  const href = $(selectors.list.nextPage).attr('href');
  if (!href) return null;
  try { return new URL(href, baseUrl).href; } catch { return null; }
}
```

- [ ] **Step 4: Запустити — переконатися, що проходить**

Run: `cd flagma-scraper && node --test test/pagination.test.js`
Expected: PASS — 2 тести.

- [ ] **Step 5: Commit**

```bash
cd flagma-scraper
git add src/routes.js test/pagination.test.js
git commit -m "feat(flagma): parseNextPageUrl — пагінація + тест зупинки на останній сторінці"
```

---

## Task 9: phone.js — `normalizePhone` + `extractPhones` + `phoneStatus`

**Files:**
- Create: `flagma-scraper/src/phone.js`
- Create: `flagma-scraper/test/phone.test.js`

- [ ] **Step 1: Написати падаючі тести**

Create `flagma-scraper/test/phone.test.js`:

```js
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
```

- [ ] **Step 2: Запустити — переконатися, що падає**

Run: `cd flagma-scraper && node --test test/phone.test.js`
Expected: FAIL — `phone.js` не існує.

- [ ] **Step 3: Реалізувати**

Create `flagma-scraper/src/phone.js`:

```js
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
```

- [ ] **Step 4: Запустити — переконатися, що проходить**

Run: `cd flagma-scraper && node --test test/phone.test.js`
Expected: PASS — 5 тестів.

- [ ] **Step 5: Commit**

```bash
cd flagma-scraper
git add src/phone.js test/phone.test.js
git commit -m "feat(flagma): phone.js — extractPhones + phoneStatus (found/hidden/failed/disabled)"
```

---

## Task 10: routes.js — DETAIL-парсер (`parseDetail`, повний запис)

**Files:**
- Modify: `flagma-scraper/src/routes.js`
- Modify: `flagma-scraper/test/routes-detail.test.js`

- [ ] **Step 1: Додати падаючі тести повного запису**

Append to `flagma-scraper/test/routes-detail.test.js`:

```js
import { parseDetail } from '../src/routes.js';

const DETAIL_URL = 'https://flagma.ua/uk/metalloprokat-truby-shveller-ugolok-balki-o14017986.html';

test('parseDetail: збирає повний запис із detail-сторінки', () => {
  const $ = loadFixture('detail-page.html');
  const rec = parseDetail($, DETAIL_URL, { fetchPhones: true });

  assert.equal(rec.id, '14017986');
  assert.equal(rec.url, DETAIL_URL);
  assert.match(rec.title, /Металлопрокат/);
  assert.ok(rec.description && rec.description.length > 10);
  assert.equal(rec.listingType, 'куплю');                 // .message-type = "Куплю"
  assert.equal(rec.normalizedPrice, 30);                  // JSON-LD offers.price
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
  // scrapedAt і sourceStartUrl додає хендлер, не parseDetail
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
```

> Звірте очікувані значення (`title`, `category`, `seller`, `location`, `normalizedPrice`) з фактичною фікстурою `detail-page.html`, якщо сайт оновив дані після 2026-06-11. Очікування вище — зі знімка цієї дати.

- [ ] **Step 2: Запустити — переконатися, що падає**

Run: `cd flagma-scraper && node --test test/routes-detail.test.js`
Expected: FAIL — `parseDetail` не експортується.

- [ ] **Step 3: Реалізувати DETAIL-парсер**

Append to `flagma-scraper/src/routes.js`:

```js
import {
  cleanText, parsePrice, detectListingType, parseSeller,
  parseLocation, parseJsonLd, categoryFromBreadcrumb,
} from './normalize.js';
import { extractPhones } from './phone.js';

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

  // ціна: rawPrice/priceUnit з CSS, нормалізоване число+валюта з пріоритетом JSON-LD
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
```

- [ ] **Step 4: Запустити — переконатися, що проходить**

Run: `cd flagma-scraper && node --test test/routes-detail.test.js`
Expected: PASS — усі тести DETAIL (Task 5 + Task 10).

- [ ] **Step 5: Прогнати весь набір тестів**

Run: `cd flagma-scraper && node --test`
Expected: PASS — усі файли (normalize, routes-list, routes-detail, pagination, phone).

- [ ] **Step 6: Commit**

```bash
cd flagma-scraper
git add src/routes.js test/routes-detail.test.js
git commit -m "feat(flagma): parseDetail — повний запис (JSON-LD first + CSS fallback)"
```

---

## Task 11: routes.js — хендлери LIST/DETAIL + main.js (інтеграція)

**Files:**
- Modify: `flagma-scraper/src/routes.js` (додати `buildRouter`)
- Create: `flagma-scraper/src/main.js`

> Це інтеграційна збірка: хендлери — тонкі обгортки над уже протестованими чистими функціями. Юніт-тести тут не пишемо (мережа/побічні ефекти); перевірка — димовий тест Task 13.

- [ ] **Step 1: Додати фабрику роутера в routes.js**

Append to `flagma-scraper/src/routes.js`:

```js
import { createCheerioRouter, Dataset } from 'crawlee';

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
  router.addDefaultHandler(handleList); // стартові URL без мітки трактуємо як LIST
  return router;
}
```

- [ ] **Step 2: Створити main.js**

Create `flagma-scraper/src/main.js`:

```js
import { Actor } from 'apify';
import { CheerioCrawler } from 'crawlee';
import { buildRouter } from './routes.js';

await Actor.init();

const input = (await Actor.getInput()) ?? {};
const {
  startUrls = [],
  maxItems = 0,
  maxRequestsPerMinute = 60,
  maxConcurrency = 5,
  fetchPhones = true,
  proxyConfiguration: proxyInput = { useApifyProxy: true },
} = input;

if (!startUrls.length) throw new Error('startUrls is required');

const proxyConfiguration = await Actor.createProxyConfiguration(proxyInput);

let pushedCount = 0;
const isLimitReached = () => maxItems > 0 && pushedCount >= maxItems;

const router = buildRouter({
  fetchPhones,
  isLimitReached,
  onPushed: () => { pushedCount += 1; },
});

const crawler = new CheerioCrawler({
  proxyConfiguration,
  maxRequestsPerMinute,
  maxConcurrency,
  requestHandler: router,
});

// стартові запити: мітка LIST + sourceStartUrl у userData (спека §4)
const startRequests = startUrls.map((entry) => {
  const url = typeof entry === 'string' ? entry : entry.url;
  return { url, label: 'LIST', userData: { sourceStartUrl: url } };
});

await crawler.run(startRequests);
await Actor.exit();
```

- [ ] **Step 3: Перевірити, що модулі імпортуються без помилок**

Run: `cd flagma-scraper && node -e "await import('./src/routes.js'); await import('./src/main.js').catch(e => { if (!/Actor|init/.test(String(e))) throw e; }); console.log('imports OK')" --input-type=module`
Expected: `imports OK` (main.js може кинути на `Actor.init` поза Apify-середовищем — це нормально; важливо, що немає синтаксичних/import-помилок).

> Якщо команда вище незручна — достатньо `node --check src/main.js && node --check src/routes.js` (перевірка синтаксису).

- [ ] **Step 4: Переконатися, що юніт-тести все ще проходять**

Run: `cd flagma-scraper && node --test`
Expected: PASS — додавання `buildRouter` не зламало парс-функції.

- [ ] **Step 5: Commit**

```bash
cd flagma-scraper
git add src/routes.js src/main.js
git commit -m "feat(flagma): LIST/DETAIL хендлери + main.js (краулер, ліміт, проксі, sourceStartUrl)"
```

---

## Task 12: Output schema (skill `apify-generate-output-schema`)

**Files:**
- Create: `flagma-scraper/.actor/dataset_schema.json`
- Modify: `flagma-scraper/.actor/actor.json` (посилання вже є з Task 1)

- [ ] **Step 1: Згенерувати схему скіл-ом**

Викликати skill **apify-generate-output-schema** для актора в `flagma-scraper/`. Він проаналізує `src/` (зокрема об'єкт запису в `parseDetail`) і згенерує `dataset_schema.json` з типізованими полями та views для UI Apify.

Поля запису для схеми (джерело істини — `parseDetail` + хендлер у Task 10–11):
`id, url, sourceStartUrl, listingType, title, description, rawPrice, normalizedPrice, currency, priceUnit, category, seller{name,type}, location{city,region,country}, phone, phoneStatus, images[], publishedAt, scrapedAt`.

- [ ] **Step 2: Перевірити валідність схеми**

Run: `cd flagma-scraper && node -e "JSON.parse(require('fs').readFileSync('.actor/dataset_schema.json','utf8')); console.log('dataset_schema.json валідний JSON')"`
Expected: `dataset_schema.json валідний JSON`

- [ ] **Step 3: Переконатися, що actor.json посилається на схему**

`.actor/actor.json` має містити `"storages": { "dataset": "./dataset_schema.json" }` (додано в Task 1). Якщо скіл змінив структуру — звірити, що посилання на місці.

- [ ] **Step 4: Commit**

```bash
cd flagma-scraper
git add .actor/dataset_schema.json .actor/actor.json
git commit -m "feat(flagma): output schema (dataset_schema.json) для UI Apify"
```

---

## Task 13: Інтеграційний димовий тест (`apify run`)

**Files:**
- Create: `flagma-scraper/input.json` (локальний вхід для `apify run`)
- Create: `flagma-scraper/Dockerfile` (якщо ще не створений шаблоном)

- [ ] **Step 1: Перевірити наявність Dockerfile**

Run: `cd flagma-scraper && test -f Dockerfile && echo "Dockerfile є" || echo "ПОТРІБЕН Dockerfile"`
Expected: `Dockerfile є`. Якщо ні — створити `flagma-scraper/Dockerfile`:

```dockerfile
FROM apify/actor-node:20
COPY package*.json ./
RUN npm --quiet set progress=false \
 && npm install --omit=dev --omit=optional \
 && echo "Installed NPM packages:" \
 && (npm list --omit=dev --all || true)
COPY . ./
CMD npm start --silent
```

- [ ] **Step 2: Створити локальний input з малим лімітом**

Create `flagma-scraper/input.json`:

```json
{
  "startUrls": [{ "url": "https://flagma.ua/uk/products/q=%D0%BC%D0%B5%D1%82%D0%B0%D0%BB%D0%BB%D0%BE%D0%BF%D1%80%D0%BE%D0%BA%D0%B0%D1%82/" }],
  "maxItems": 5,
  "maxRequestsPerMinute": 60,
  "maxConcurrency": 3,
  "fetchPhones": true,
  "proxyConfiguration": { "useApifyProxy": false }
}
```

> `useApifyProxy: false` для локального прогону без споживання проксі-трафіку. На платформі — увімкнути.

- [ ] **Step 3: Запустити актора локально**

Run: `cd flagma-scraper && apify run -i input.json`
Expected: лог показує `LIST … N лотів, next=true`, далі `DETAIL`-обробку; завершується без помилок; зібрано ~5 записів (через `maxItems`).

- [ ] **Step 4: Перевірити вміст датасету**

Run: `cd flagma-scraper && cat storage/datasets/default/*.json | head -c 1500`
Expected: JSON-записи з заповненими `id`, `url`, `title`, `rawPrice`/`normalizedPrice`, `phone`/`phoneStatus`, `sourceStartUrl`, `scrapedAt`. Для більшості лотів `phoneStatus: "found"`.

- [ ] **Step 5: Зафіксувати критерії успіху (спека §13)**

Перевірити вручну по записах:
- пагінація відпрацювала (у логах був `next=true`, потім зупинка);
- дедуплікація: немає двох записів з однаковим `id`;
- `rawPrice`/`normalizedPrice` коректні (зокрема текстова ціна → `normalizedPrice: null`);
- `sourceStartUrl` заповнений у кожному записі.

- [ ] **Step 6: Commit**

```bash
cd flagma-scraper
git add input.json Dockerfile
echo "storage/" >> .gitignore
git add .gitignore
git commit -m "test(flagma): локальний input + Dockerfile для apify run (димовий тест)"
```

---

## Task 14: Деплой на Apify під `japan_hat`

**Files:** (без змін коду — лише публікація)

> Передумова: користувач залогінений у `apify` CLI як `japan_hat` (memory: Apify CLI setup). Перевірити: `apify info`.

- [ ] **Step 1: Переконатися, що всі тести зелені перед деплоєм**

Run: `cd flagma-scraper && node --test`
Expected: PASS — усі тести.

- [ ] **Step 2: Перевірити акаунт**

Run: `apify info`
Expected: показує користувача `japan_hat`. Якщо ні — `apify login` (зупинитись і повідомити користувача — не логінити наосліп).

- [ ] **Step 3: Запушити актора**

Run: `cd flagma-scraper && apify push`
Expected: збірка проходить успішно; CLI друкує URL актора в Apify Console.

- [ ] **Step 4: Тестовий запуск на платформі**

Запустити актора в Apify Console з `input.json` (або через `apify call`), `maxItems: 5`, `proxyConfiguration: { useApifyProxy: true }`.
Expected: запуск `SUCCEEDED`; датасет містить записи; експорт у CSV/JSON працює з UI (поля типізовані завдяки output schema).

- [ ] **Step 5: Фінальна перевірка критеріїв успіху (спека §13)**

- [x] GATE №0 дав чітке go/no-go (Task 0).
- [ ] Актор проходить пагінацію, дедуплікує за `id`, збирає всі поля.
- [ ] `phoneStatus: found` для більшості лотів.
- [ ] `rawPrice`/`normalizedPrice` коректно обробляють текстові ціни.
- [ ] Дані експортуються в CSV/JSON; output schema валідна.
- [ ] Задеплоєно під `japan_hat`; успішний тестовий запуск.

- [ ] **Step 6: Commit (якщо apify push згенерував зміни, напр. оновив actor.json)**

```bash
cd flagma-scraper
git add -A
git commit -m "chore(flagma): deploy під japan_hat — тестовий запуск пройдено" || echo "немає змін для коміту"
```

---

## Мапінг плану на спеку (self-review)

| Спека | Задачі плану |
|---|---|
| §1–2 Призначення/межі (лише збір) | вся структура; жодної арбітражної логіки |
| §3 Стек/архітектура (CheerioCrawler, роутер) | Task 1, 11 |
| §3.1 Модулі (main/routes/phone/selectors/normalize) | Task 5, 6, 7, 9, 11 |
| §4 Потік даних + `sourceStartUrl` через userData | Task 11 |
| §5 INPUT_SCHEMA | Task 1 |
| §6 Структура запису | Task 10 (parseDetail) + Task 12 (схема) |
| §6 Ціна rawPrice/normalizedPrice | Task 3, 10 |
| §7 id + дедуплікація (uniqueKey за id, fallback url) | Task 2, 7, 11 |
| §8 GATE №0 + phoneStatus | Task 0, 9 |
| §9 Обробка помилок (пропуск без title, nullable, retries) | Task 10, 11 (Crawlee retries/proxy — Task 11) |
| §10 Тестування (юніти на фікстурах, пагінація, димовий) | Task 2–10, 13 |
| §11 Юр-етичний запобіжник (темп, fetchPhones off) | Task 1 (`maxRequestsPerMinute`, `fetchPhones`) |
| §12 Поза скоупом | не реалізується (свідомо) |
| §13 Критерії успіху | Task 13, 14 |
| §14 Послідовність фаз | Task 0 → 14 один-в-один |

**Відхилення від спеки (на користь реальності, підтверджено розвідкою):**
- Reveal телефону **не потребує окремого HTTP-запиту** — номери в статичному HTML detail-сторінки (`#contactDialog .phones a.tel`). `phone.js` парсить DOM. Це підмножина «підходу A» зі спеки §8, простіша й надійніша. GATE №0 (Task 0) формально це підтверджує перед рештою реалізації.
- DETAIL-парсинг використовує **JSON-LD** (Schema.org) як основне джерело для `name`/`description`/`price`/`currency`/`category` — стабільніше за CSS; CSS лишається fallback-ом і єдиним джерелом для полів поза JSON-LD (телефон, продавець, локація, всі фото, дата).
