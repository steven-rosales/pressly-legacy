import type { Ok } from '@pressly/kernel';
import type {
  ReconcileSourceLocationBindingsResult,
  SourceLocationBindingsManifest,
} from './reconcile-source-location-bindings.model.ts';
import type { SourceLocationBinding } from './source-location-binding.entity.ts';

export type ReconcileSourceLocationBindings = (command: {
  manifest: SourceLocationBindingsManifest;
  dryRun: boolean;
}) => Promise<Ok<ReconcileSourceLocationBindingsResult>>;

export type ReconcileSourceLocationBindingsRepository = Readonly<{
  loadAll: () => Promise<readonly SourceLocationBinding[]>;
  insert: (
    bindings: readonly SourceLocationBinding[],
    now: Date,
  ) => Promise<void>;
}>;
