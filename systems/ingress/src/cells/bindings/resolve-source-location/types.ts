export const resolveSourceLocationOperationId =
  'ingress.resolve-source-location.v1' as const;
export type ResolveSourceLocationInput = Readonly<{
  source: string;
  externalLocationId: string;
}>;
export type ResolveSourceLocationResult = string | null;
export type ResolveSourceLocationExpectedFailure = never;
export type ResolveSourceLocationRepository = Readonly<{
  resolve: (
    input: ResolveSourceLocationInput,
  ) => Promise<ResolveSourceLocationResult>;
}>;
