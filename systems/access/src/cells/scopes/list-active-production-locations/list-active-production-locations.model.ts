export type ActiveProductionLocation = Readonly<{
  id: string;
  businessId: string;
  name: string;
  timezone: string;
}>;

export type ActiveProductionLocations = Readonly<{
  locations: readonly ActiveProductionLocation[];
}>;
