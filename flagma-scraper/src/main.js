import { Actor } from 'apify';
import { CheerioCrawler } from 'crawlee';
import { buildRouter } from './routes.js';

await Actor.init();

const input = (await Actor.getInput()) ?? {};
const {
  startUrls = [],
  maxItems = 0,
  maxRequestsPerMinute = 40,
  maxConcurrency = 3,
  maxRequestRetries = 5,
  fetchPhones = true,
  listingType: listingTypeInput = 'all',
  proxyConfiguration: proxyInput = { useApifyProxy: false },
} = input;

if (!startUrls.length) throw new Error('startUrls is required');

// Нормалізуємо фільтр типу: лише all | buy | sell, інше → all.
const listingType = ['all', 'buy', 'sell'].includes(listingTypeInput) ? listingTypeInput : 'all';

const proxyConfiguration = await Actor.createProxyConfiguration(proxyInput);

let pushedCount = 0;
const isLimitReached = () => maxItems > 0 && pushedCount >= maxItems;

const router = buildRouter({
  fetchPhones,
  listingType,
  isLimitReached,
  onPushed: () => { pushedCount += 1; },
});

const crawler = new CheerioCrawler({
  proxyConfiguration,
  maxRequestsPerMinute,
  maxConcurrency,
  maxRequestRetries,
  // Антибан: Flagma віддає 403 при швидкому темпі без житлових проксі.
  // Ротуємо сесії й ретраїмо заблоковані запити з backoff.
  useSessionPool: true,
  retryOnBlocked: true,
  requestHandler: router,
});

// стартові запити: мітка LIST + sourceStartUrl у userData (спека §4)
const startRequests = startUrls.map((entry) => {
  const url = typeof entry === 'string' ? entry : entry.url;
  return { url, label: 'LIST', userData: { sourceStartUrl: url } };
});

await crawler.run(startRequests);
await Actor.exit();
