export type ResolveSourceLocation = (query: {
  source: string;
  externalLocationId: string;
}) => Promise<string | null>;
