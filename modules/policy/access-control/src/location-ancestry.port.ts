export type LocationAncestryPort = Readonly<{
  resolveBusinessId: (locationId: string) => Promise<string>;
  listLocationIdsForBusinesses: (
    businessIds: readonly string[],
  ) => Promise<readonly string[]>;
}>;
