import type { Ok } from '@pressly/kernel';
import type {
  ReconcileSourceLocationBindingsResult,
  SourceLocationBindingsManifest,
} from './reconcile-source-location-bindings.model.ts';

export type ReconcileSourceLocationBindings = (command: {
  manifest: SourceLocationBindingsManifest;
  dryRun: boolean;
}) => Promise<Ok<ReconcileSourceLocationBindingsResult>>;
