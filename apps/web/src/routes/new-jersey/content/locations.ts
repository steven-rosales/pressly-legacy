export type LocationRecord = {
  county: string;
  citySlug: string;
  cityName: string;
  zips: string[];
  heroImage: string;
  schemaAddress?: {
    streetAddress?: string;
    postalCode?: string;
  };
  geo?: {
    latitude: number;
    longitude: number;
  };
  aggregateRating?: {
    ratingValue: number;
    reviewCount: number;
  };
  seoCityDescription?: string;
  versions?: {
    seoCityHeroDescription?: 1 | 2 | 3 | 4 | 5;
    seoCityHIWTitleSchedule?: 1 | 2 | 3;
    seoCityHIWTitlePickup?: 1 | 2 | 3;
    seoCityHIWTitleClean?: 1 | 2 | 3;
    seoCityHIWTitleDeliver?: 1 | 2 | 3;
    seoCityHIWDescriptionSchedule?: 1 | 2 | 3;
    seoCityHIWDescriptionPickup?: 1 | 2 | 3;
    seoCityHIWDescriptionClean?: 1 | 2 | 3;
    seoCityHIWDescriptionDeliver?: 1 | 2 | 3;
    serviceTitle?: 1 | 2 | 3;
    seoCityDescriptionTitle?: 1 | 2 | 3 | 4 | 5;
    seoCityDescription?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
    seoTitle?: 1 | 2 | 3;
    endTitle?: 1 | 2 | 3;
  };
  overrides?: { hiwTitle?: string; testimonialTitle?: string };
};

// Raw location data (state/county/city) sourced from legacy site; used for SSG params and copy.
// Do not mutate at runtime.
import raw from './locations.json';

function normalizeHeroImage(path: string) {
  // Legacy paths were /images/locations/*.webp; assets now live in /public/locations/*.
  if (typeof path === 'string' && path.startsWith('/images/locations/')) {
    return path.replace('/images/locations/', '/locations/');
  }
  return path;
}

export const LOCATIONS = (raw as LocationRecord[]).map((r) => ({
  ...r,
  heroImage: normalizeHeroImage(r.heroImage),
}));

export function findLocation(county: string, city: string) {
  return LOCATIONS.find((r) => r.county === county && r.citySlug === city);
}

export function allParamsForState() {
  return LOCATIONS.map((r) => ({
    county: r.county,
    city: r.citySlug,
  }));
}
