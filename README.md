# Flagma Scraper

Монорепозиторій інструмента для збору оголошень з [Flagma.ua](https://flagma.ua): сам **Apify-актор** (Crawlee CheerioCrawler) і **дизайн-документи** — спека та план реалізації.

**Лише збір даних** — без арбітражної логіки. Зіставлення «куплю ↔ продам» і розрахунок маржі — окремий інструмент пізніше. Актор готує чистий, структурований датасет, на якому той інструмент працюватиме.

## Що всередині

| Шлях | Що це |
|---|---|
| [`flagma-scraper/`](flagma-scraper/) | Сам Apify-актор: код, тести, схеми, Dockerfile |
| [`flagma-scraper/README.md`](flagma-scraper/README.md) | **Повна документація актора** — запуск, вхідні параметри, поля результату, проксі, деплой, обмеження |
| [`docs/superpowers/specs/2026-06-11-flagma-scraper-design.md`](docs/superpowers/specs/2026-06-11-flagma-scraper-design.md) | Дизайн-документ (спека): призначення, межі, селектори, модель даних |
| [`docs/superpowers/plans/2026-06-11-flagma-scraper.md`](docs/superpowers/plans/2026-06-11-flagma-scraper.md) | План реалізації task-by-task + перевірені факти розвідки сайту |

## Швидкий старт

Актор живе у підпапці [`flagma-scraper/`](flagma-scraper/):

```bash
git clone https://github.com/luka031091-hash/flagma-scraper.git
cd flagma-scraper/flagma-scraper
npm install
apify run
```

Деталі — вхідні параметри, структура результату, налаштування проксі, деплой на Apify і чесні обмеження — у [README актора](flagma-scraper/README.md).

## Стек

- **Node.js 18+** (ESM)
- **Crawlee CheerioCrawler** — HTTP-краул без браузера (швидко й економно)
- **Apify SDK** — локальний запуск і деплой у хмару
- **cheerio** — парсинг HTML: **JSON-LD** (Schema.org) first + CSS-fallback
- `node:test` — юніт-тести на реальних HTML-фікстурах, без зайвих залежностей

## Архітектура (коротко)

Двофазний краул через роутер:

- **LIST** — сторінка пошуку/категорії: картки → черга `DETAIL` + наступна сторінка (пагінація за `<link rel="next">`).
- **DETAIL** — оголошення: усі поля + телефон → запис у dataset.

Чиста логіка (нормалізація ціни/типу/продавця, побудова `id`, парсинг телефону) винесена в тестовані функції без мережі. Усі CSS-селектори централізовані в одному модулі.

---

*Згенеровано з [Claude Code](https://claude.com/claude-code).*
