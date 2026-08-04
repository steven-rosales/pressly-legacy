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
