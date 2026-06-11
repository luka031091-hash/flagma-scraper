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

(еквівалент `node --test`)
