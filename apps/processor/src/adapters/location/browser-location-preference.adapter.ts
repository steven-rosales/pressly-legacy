import type { LocationPreferencePort } from '@/ports/location-preference.port';

const preferenceKey = 'pressly.processor.location';

export const makeBrowserLocationPreferenceAdapter = (
  storage: Storage,
): LocationPreferencePort => ({
  read: () => storage.getItem(preferenceKey),
  save: (locationId) => storage.setItem(preferenceKey, locationId),
  clear: () => storage.removeItem(preferenceKey),
});
