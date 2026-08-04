import type { SourceLocationBinding } from '../../language/source-location-bindings/source-location-binding.entity.ts';

export type SourceLocationBindingStore = Readonly<{
  resolve: (query: {
    source: string;
    externalLocationId: string;
  }) => Promise<string | null>;
  loadAll: () => Promise<readonly SourceLocationBinding[]>;
  insert: (
    bindings: readonly SourceLocationBinding[],
    now: Date,
  ) => Promise<void>;
}>;
