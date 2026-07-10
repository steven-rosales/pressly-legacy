import type { Metadata } from 'next';

import {
  buildCityServiceMetadata,
  buildCountyMetadata,
  buildStateMetadata,
} from '@/app/_lib/seo';
import { resolveCityService } from './content';

export const newJerseyMetadata: Metadata = buildStateMetadata();

export const getCountyPageMetadata = (county: string): Metadata =>
  buildCountyMetadata(county);

export const getCityServicePageMetadata = (
  county: string,
  slug: string,
): Metadata | null => {
  const resolved = resolveCityService(county, slug);
  if (resolved === null) return null;

  return buildCityServiceMetadata({
    location: resolved.location,
    serviceType: resolved.serviceType,
  });
};
