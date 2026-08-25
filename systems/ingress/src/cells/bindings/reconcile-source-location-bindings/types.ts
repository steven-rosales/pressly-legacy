import type {
  ReconcileSourceLocationBindingsResult,
  SourceLocationBinding,
  SourceLocationBindingsManifest,
} from './model.ts';

export const reconcileSourceLocationBindingsOperationId =
  'ingress.reconcile-source-location-bindings.v1' as const;
export type ReconcileSourceLocationBindingsCommand = Readonly<{
  manifest: SourceLocationBindingsManifest;
  dryRun: boolean;
}>;
export type ReconcileSourceLocationBindingsExpectedFailure = never;

export type SourceLocationBindingPlan = Readonly<{
  status: 'converged' | 'rejected';
  operations: ReconcileSourceLocationBindingsResult['operations'];
  rejections: ReconcileSourceLocationBindingsResult['rejections'];
  additions: readonly SourceLocationBinding[];
}>;

export type ReconcileSourceLocationBindingsTransaction = Readonly<{
  loadAll: () => Promise<readonly SourceLocationBinding[]>;
  insert: (
    bindings: readonly SourceLocationBinding[],
    now: Date,
  ) => Promise<void>;
}>;
export type ReconcileSourceLocationBindingsRepository = Readonly<{
  transaction: <Value>(
    work: (
      repository: ReconcileSourceLocationBindingsTransaction,
    ) => Promise<Value>,
  ) => Promise<Value>;
}>;
export type ReconcileSourceLocationBindingsClock = Readonly<{
  now: () => Date;
}>;
