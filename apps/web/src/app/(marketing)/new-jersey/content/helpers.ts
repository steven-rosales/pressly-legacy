import { findLocation, allParamsForState } from './locations';
import {
  getCityFromSlug,
  getServiceConfig,
  getServiceTypeFromSlug,
} from './service-configs';

export function buildCityServiceParams() {
  const base = allParamsForState();
  const params: { county: string; slug: string }[] = [];

  base.forEach((param) => {
    params.push({
      county: param.county,
      slug: `laundry-service-in-${param.city}`,
    });
    params.push({
      county: param.county,
      slug: `dry-cleaners-in-${param.city}`,
    });
  });

  return params;
}

export function resolveCityService(county: string, slug: string) {
  const serviceType = getServiceTypeFromSlug(slug);
  const city = getCityFromSlug(slug);
  if (!serviceType || !city) return null;
  const location = findLocation(county, city);
  if (!location) return null;

  return {
    serviceType,
    city,
    location,
    serviceConfig: getServiceConfig(serviceType),
  };
}
