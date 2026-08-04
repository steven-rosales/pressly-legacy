export type LocationPreferencePort = Readonly<{
  read: () => string | null;
  save: (locationId: string) => void;
  clear: () => void;
}>;
