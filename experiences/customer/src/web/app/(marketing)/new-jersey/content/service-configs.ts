export type ServiceType = 'washFold' | 'dryCleaning';

export interface ServiceConfig {
  serviceTitle: string;
  videoSrc?: string;
  muxPlaybackId?: string;
  serviceParagraph1: string;
  serviceParagraph2: string;
  serviceParagraph3: string;
  pageTitle: string;
  metaDescription: string;
  isDryCleaningService: boolean;
}

export const WASH_AND_FOLD_CONFIG: ServiceConfig = {
  serviceTitle: 'Wash & Fold',
  muxPlaybackId: 'usSVf2O6xPBSn502vevarz7b6L16iLfNwLhahNMp6fWU',
  serviceParagraph1:
    'Perfect option for your clothes that need to be washed, dried, and crisply folded. You can put your clothes in any bag available to you.',
  serviceParagraph2:
    'We inspect your pockets, sort your whites and darks, wash with your preferences, and dry all your clothing on a low setting.',
  serviceParagraph3:
    'Your cleaning and delivery preferences can be modified in your account or when scheduling your pickup.',
  pageTitle: 'Wash & Fold Laundry Service',
  metaDescription:
    'Professional wash and fold laundry service with pickup and delivery.',
  isDryCleaningService: false,
};

export const DRY_CLEANING_CONFIG: ServiceConfig = {
  serviceTitle: 'Dry Cleaning',
  muxPlaybackId: 'GlNneqM009oFYlwe302Xc3AP01ovPdNf02gXboUfKm6XwY8',
  serviceParagraph1:
    'Your dry cleaning will be expertly cleaned, pressed, hung, and prepared for wearing.',
  serviceParagraph2:
    'Our company-wide sustainable practices ensure your garments are cleaned in the most efficient way. We have eliminated harsh chemicals such as PERC.',
  serviceParagraph3:
    'All your items in your new dry cleaning bag will be cleaned with non-water based solutions.',
  pageTitle: 'Dry Cleaning Delivery Service',
  metaDescription:
    'Professional dry cleaning service with convenient pickup and delivery.',
  isDryCleaningService: true,
};

export function getServiceConfig(serviceType: ServiceType): ServiceConfig {
  return serviceType === 'dryCleaning'
    ? DRY_CLEANING_CONFIG
    : WASH_AND_FOLD_CONFIG;
}

export function getServiceTypeFromSlug(slug?: string): ServiceType | null {
  if (!slug) return null;
  if (slug.startsWith('laundry-service-in-')) return 'washFold';
  if (slug.startsWith('dry-cleaners-in-')) return 'dryCleaning';
  return null;
}

export function getCityFromSlug(slug?: string): string | null {
  if (!slug) return null;
  if (slug.startsWith('laundry-service-in-'))
    return slug.replace('laundry-service-in-', '');
  if (slug.startsWith('dry-cleaners-in-'))
    return slug.replace('dry-cleaners-in-', '');

  return null;
}
