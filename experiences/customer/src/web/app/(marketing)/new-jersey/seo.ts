import type { Metadata } from 'next';

import {
  buildCityServiceMetadata,
  buildCountyMetadata,
  buildStateMetadata,
} from '#customer/app/_lib/seo/metadata';
import { resolveCityService } from './content/helpers';

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
