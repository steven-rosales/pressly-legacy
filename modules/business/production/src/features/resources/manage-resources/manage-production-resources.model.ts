export type ProductionLocationResource = Readonly<{
  id: string;
  businessId: string;
  name: string;
  timezone: string;
  isActive: boolean;
}>;

export type ProductionStationResource = Readonly<{
  locationId: string;
  kind: 'sorting' | 'washing' | 'drying' | 'folding_packaging';
  label: string;
  sortOrder: number;
  isActive: boolean;
}>;

export type ProductionMachineResource = Readonly<{
  locationId: string;
  stationKind: 'washing' | 'drying';
  label: string;
  manufacturerCapacityLbs: number | null;
  effectiveCapacityLbs: number | null;
  capacitySafetyMarginLbs: number | null;
  isActive: boolean;
}>;

export type ProductionSchedulerConfigResource = Readonly<{
  locationId: string;
  pulseMinutes: number;
  foldLbsPerFolderMinute: number;
  algorithmVersion: 'fixed-pulse-ffd-v1' | 'fixed-pulse-ffd-v2';
  stageFitAssertion: Readonly<{
    sortingFits: true;
    washingFits: true;
    dryingFits: true;
  }>;
}>;

export type ProductionBootstrapManifest = Readonly<{
  schemaVersion: 1;
  location: ProductionLocationResource;
  stations: readonly ProductionStationResource[];
  machines: readonly ProductionMachineResource[];
  schedulerConfig: ProductionSchedulerConfigResource;
}>;

export type ProductionBootstrapCommand = Readonly<{
  manifest: ProductionBootstrapManifest;
  dryRun: boolean;
  idempotencyKey: string;
  actorId: string;
}>;

export type ProductionBootstrapResourceType =
  | 'location'
  | 'station'
  | 'machine'
  | 'scheduler_config';

export type ProductionBootstrapResourceChange = Readonly<{
  resourceType: ProductionBootstrapResourceType;
  naturalKey: string;
  outcome: 'created' | 'updated' | 'noop';
  changedFields: readonly string[];
}>;

export type ProductionBootstrapDestructiveRejection = Readonly<{
  resourceType: ProductionBootstrapResourceType;
  naturalKey: string;
  outcome: 'rejected';
  code:
    | 'destructive_resource_removal'
    | 'destructive_resource_deactivation'
    | 'natural_key_change';
  message: string;
}>;

export type ProductionBootstrapSummary = Readonly<{
  created: number;
  updated: number;
  noop: number;
  rejected: number;
}>;

type ProductionBootstrapResultBase = Readonly<{
  mode: 'dry_run' | 'apply';
  configurationHash: string;
  operations: readonly ProductionBootstrapResourceChange[];
  summary: ProductionBootstrapSummary;
  replayed: boolean;
}>;

export type ProductionBootstrapResult =
  | (ProductionBootstrapResultBase &
      Readonly<{
        status: 'converged';
        rejections: readonly [];
        applied: boolean;
      }>)
  | (ProductionBootstrapResultBase &
      Readonly<{
        status: 'rejected';
        rejections: readonly [
          ProductionBootstrapDestructiveRejection,
          ...ProductionBootstrapDestructiveRejection[],
        ];
        applied: false;
      }>);
