import { LOCATIONS, findLocation, allParamsForState } from './locations';
import {
  DRY_CLEANING_CONFIG,
  WASH_AND_FOLD_CONFIG,
  getCityFromSlug,
  getServiceConfig,
  getServiceTypeFromSlug,
} from './service-configs';
import type { ServiceType } from './service-configs';
import { COUNTY_CITIES } from './county-cities';

export {
  LOCATIONS,
  findLocation,
  allParamsForState,
  DRY_CLEANING_CONFIG,
  WASH_AND_FOLD_CONFIG,
  getCityFromSlug,
  getServiceConfig,
  getServiceTypeFromSlug,
  COUNTY_CITIES,
  type ServiceType,
};

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
