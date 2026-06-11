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
