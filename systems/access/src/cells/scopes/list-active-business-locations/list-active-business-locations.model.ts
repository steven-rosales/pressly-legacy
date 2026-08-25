export type ActiveBusinessLocation = Readonly<{
  id: string;
  name: string;
  timezone: string;
}>;

export type ActiveBusinessLocations = Readonly<{
  locations: readonly ActiveBusinessLocation[];
}>;
