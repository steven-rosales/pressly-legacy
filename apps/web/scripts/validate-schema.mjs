const baseUrl = process.env.SCHEMA_BASE_URL ?? 'http://localhost:3000';
const canonicalUrl =
  process.env.SCHEMA_CANONICAL_URL ?? 'https://trypressly.com';

const checks = [
  {
    path: '/new-jersey/bergen-county/laundry-service-in-fort-lee',
    type: 'location',
    requiredTypes: ['DryCleaningOrLaundry', 'Service', 'OfferCatalog'],
    requiredNames: [
      'Wash & Fold Laundry',
      'Wash & Fold Minimum',
      'Hang Dry',
      'Small Comforter',
    ],
  },
  {
    path: '/new-jersey/bergen-county/dry-cleaners-in-fort-lee',
    type: 'location',
    requiredTypes: ['DryCleaningOrLaundry', 'Service', 'OfferCatalog'],
    requiredNames: [
      'Dry Cleaning Minimum',
      'Launder & Press',
      'Tops',
      'Shirts',
      'Household',
    ],
  },
  {
    path: '/services-pricing/wash-fold',
    type: 'pricing',
    requiredTypes: ['Service', 'OfferCatalog'],
    requiredNames: [
      'Wash & Fold Laundry',
      'Wash & Fold Minimum',
      'Hang Dry',
      'Small Comforter',
    ],
  },
  {
    path: '/services-pricing/dry-cleaning',
    type: 'pricing',
    requiredTypes: ['Service', 'OfferCatalog'],
    requiredNames: [
      'Dry Cleaning Minimum',
      'Launder & Press',
      'Tops',
      'Shirts',
      'Household',
    ],
  },
];

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function jsonLdScripts(html) {
  return [
    ...html.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ].map((match) => match[1].trim());
}

function parseJsonLd(html, path) {
  return jsonLdScripts(html).flatMap((script, index) => {
    try {
      const parsed = JSON.parse(script);
      return parsed['@graph'] ? parsed['@graph'] : [parsed];
    } catch (error) {
      fail(`${path} has invalid JSON-LD script ${index + 1}: ${error.message}`);
      return [];
    }
  });
}

function typeMatches(node, type) {
  const nodeType = node?.['@type'];
  return Array.isArray(nodeType) ? nodeType.includes(type) : nodeType === type;
}

function collectNames(value, names = new Set()) {
  if (!value || typeof value !== 'object') return names;

  if (Array.isArray(value)) {
    value.forEach((entry) => collectNames(entry, names));
    return names;
  }

  if (typeof value.name === 'string') {
    names.add(value.name);
  }

  Object.values(value).forEach((entry) => collectNames(entry, names));
  return names;
}

async function fetchText(path) {
  const response = await fetch(new URL(path, baseUrl));
  const body = await response.text();
  return { response, body };
}

for (const check of checks) {
  const { response, body } = await fetchText(check.path);
  if (response.status !== 200) {
    fail(`${check.path} returned ${response.status}`);
    continue;
  }

  const nodes = parseJsonLd(body, check.path);
  const names = collectNames(nodes);

  for (const type of check.requiredTypes) {
    if (!nodes.some((node) => typeMatches(node, type))) {
      fail(`${check.path} is missing ${type} schema`);
    }
  }

  const service = nodes.find((node) => typeMatches(node, 'Service'));
  if (!service?.hasOfferCatalog) {
    fail(`${check.path} Service schema is missing hasOfferCatalog`);
  }

  if (check.type === 'location') {
    const business = nodes.find((node) =>
      typeMatches(node, 'DryCleaningOrLaundry'),
    );

    if (!business?.address?.postalCode) {
      fail(`${check.path} location schema is missing postalCode`);
    }

    const urlTemplate = business?.potentialAction?.target?.urlTemplate;
    if (urlTemplate !== new URL('/schedule', canonicalUrl).toString()) {
      fail(`${check.path} OrderAction does not target /schedule`);
    }
  }

  for (const name of check.requiredNames) {
    if (!names.has(name)) {
      fail(`${check.path} schema is missing pricing name: ${name}`);
    }
  }
}

const { response: scheduleResponse, body: scheduleBody } =
  await fetchText('/schedule');
if (scheduleResponse.status !== 200) {
  fail(`/schedule returned ${scheduleResponse.status}`);
}
if (!/noindex/i.test(scheduleBody)) {
  fail('/schedule is missing noindex');
}

const { response: sitemapResponse, body: sitemapBody } =
  await fetchText('/sitemap.xml');
if (sitemapResponse.status !== 200) {
  fail(`/sitemap.xml returned ${sitemapResponse.status}`);
}

const sitemapPaths = [...sitemapBody.matchAll(/<loc>(.*?)<\/loc>/g)].map(
  (match) => new URL(match[1]).pathname,
);
for (const path of [
  '/schedule',
  '/login',
  '/signup',
  '/account',
  '/reset-password',
  '/logout',
  '/opt-in',
  '/services-pricing',
]) {
  if (sitemapPaths.includes(path)) {
    fail(`Sitemap includes non-indexable path: ${path}`);
  }
}

if (!process.exitCode) {
  console.log(`Schema checks OK against ${baseUrl}`);
}
