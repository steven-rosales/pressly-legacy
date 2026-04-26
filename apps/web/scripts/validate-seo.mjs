import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const locationsPath = resolve(
  root,
  'src/routes/shared/marketing/content/locations.json',
);

const locations = JSON.parse(readFileSync(locationsPath, 'utf8'));

const forbiddenSitemapPaths = new Set([
  '/schedule',
  '/login',
  '/logout',
  '/signup',
  '/account',
  '/reset-password',
  '/opt-in',
  '/services-pricing',
]);

const staticIndexableRoutes = [
  '/',
  '/services-pricing/wash-fold',
  '/services-pricing/dry-cleaning',
  '/commercial',
  '/about',
  '/faqs',
  '/contact',
  '/careers',
  '/new-jersey',
  '/privacy',
  '/terms',
];

function cityServiceRoutes(location) {
  return [
    `/new-jersey/${location.county}/laundry-service-in-${location.citySlug}`,
    `/new-jersey/${location.county}/dry-cleaners-in-${location.citySlug}`,
  ];
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

const counties = [...new Set(locations.map((location) => location.county))];
const cityRoutes = locations.flatMap(cityServiceRoutes);
const expectedRoutes = [
  ...staticIndexableRoutes,
  ...counties.map((county) => `/new-jersey/${county}`),
  ...cityRoutes,
];

const duplicateRoutes = expectedRoutes.filter(
  (route, index) => expectedRoutes.indexOf(route) !== index,
);

if (duplicateRoutes.length > 0) {
  fail(`Duplicate SEO routes found:\n${duplicateRoutes.join('\n')}`);
}

for (const route of expectedRoutes) {
  if (forbiddenSitemapPaths.has(route)) {
    fail(`Forbidden non-indexable route is in expected sitemap set: ${route}`);
  }
}

const incompleteLocations = locations.filter((location) => {
  return (
    !location.county ||
    !location.citySlug ||
    !location.cityName ||
    !Array.isArray(location.zips) ||
    location.zips.length === 0 ||
    !location.heroImage
  );
});

if (incompleteLocations.length > 0) {
  fail(
    `Locations missing local SEO fields:\n${incompleteLocations
      .map((location) => `${location.county}/${location.citySlug}`)
      .join('\n')}`,
  );
}

console.log(
  [
    `SEO route model OK`,
    `Static routes: ${staticIndexableRoutes.length}`,
    `County routes: ${counties.length}`,
    `City-service routes: ${cityRoutes.length}`,
    `Total indexable routes modeled: ${expectedRoutes.length}`,
  ].join('\n'),
);
