export const listLocationsOperationId = 'production.list-locations.v1' as const;

export type ListLocationsInput = Readonly<{
  includeInactive: boolean;
  allowedLocationIds: readonly string[] | null;
}>;

export type ProductionLocation = Readonly<{
  id: string;
  name: string;
  timezone: string;
  isActive: boolean;
}>;

export type ProductionLocations = Readonly<{
  items: readonly ProductionLocation[];
  asOf: Date;
}>;

export type ListLocationsRepository = Readonly<{
  list: (input: ListLocationsInput) => Promise<readonly ProductionLocation[]>;
}>;

export type ListLocationsClock = Readonly<{ now: () => Date }>;

export type ListLocationsExpectedFailure = never;
