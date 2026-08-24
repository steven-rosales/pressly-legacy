import type { PricingCatalogLoader } from '#customer/features/pricing/model';
import { getNewJerseyPageModel } from './model';
import { LocationPageView } from './ui/LocationPageView';

export async function renderNewJerseyPage(
  pricingCatalog: PricingCatalogLoader,
) {
  return (
    <LocationPageView model={await getNewJerseyPageModel(pricingCatalog)} />
  );
}
