export type SourceLocationBinding = Readonly<{
  source: string;
  externalLocationId: string;
  locationId: string;
  isActive: boolean;
}>;

export type SourceLocationBindingsManifest = Readonly<{
  sourceLocationBindings: readonly SourceLocationBinding[];
}>;

export type SourceLocationBindingChange = Readonly<{
  source: string;
  externalLocationId: string;
  locationId: string;
  outcome: 'created' | 'noop';
}>;

export type SourceLocationBindingRejection = Readonly<{
  source: string;
  externalLocationId: string;
  code: 'binding_location_change' | 'binding_deactivation' | 'binding_removal';
  message: string;
}>;

export type ReconcileSourceLocationBindingsResult = Readonly<{
  mode: 'dry_run' | 'apply';
  status: 'converged' | 'rejected';
  applied: boolean;
  operations: readonly SourceLocationBindingChange[];
  rejections: readonly SourceLocationBindingRejection[];
}>;
