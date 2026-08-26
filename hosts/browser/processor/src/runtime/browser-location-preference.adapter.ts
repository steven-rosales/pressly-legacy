import type { LocationPreferencePort } from '@pressly/topology/browser';

const preferenceKey = 'pressly.processor.location';

export const makeBrowserLocationPreferenceAdapter = (
  storage: Readonly<{
    read: (key: string) => string | null;
    write: (key: string, value: string) => void;
    remove: (key: string) => void;
  }>,
): LocationPreferencePort => ({
  read: () => storage.read(preferenceKey),
  save: (locationId) => storage.write(preferenceKey, locationId),
  clear: () => storage.remove(preferenceKey),
});
