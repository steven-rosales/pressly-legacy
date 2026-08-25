export const reconcileProductionLocationOperationId =
  'access.reconcile-production-location.v1' as const;

export type AccessProductionLocation = Readonly<{
  id: string;
  businessId: string;
  name: string;
  timezone: string;
  isActive: boolean;
}>;

export type ReconcileProductionLocationCommand = Readonly<{
  location: AccessProductionLocation;
  dryRun: boolean;
}>;

export type ProductionLocationReconciliationChange = Readonly<{
  resourceType: 'location';
  naturalKey: string;
  outcome: 'created' | 'updated' | 'noop';
  changedFields: readonly string[];
}>;

export type ProductionLocationReconciliationRejection = Readonly<{
  resourceType: 'location';
  naturalKey: string;
  outcome: 'rejected';
  code:
    | 'business_not_found'
    | 'destructive_resource_deactivation'
    | 'natural_key_change';
  message: string;
}>;

type ReconcileProductionLocationResultBase = Readonly<{
  mode: 'apply' | 'dry_run';
  operation: ProductionLocationReconciliationChange | null;
}>;

export type ReconcileProductionLocationResult =
  | (ReconcileProductionLocationResultBase &
      Readonly<{
        status: 'converged';
        applied: boolean;
        rejections: readonly [];
      }>)
  | (ReconcileProductionLocationResultBase &
      Readonly<{
        status: 'rejected';
        applied: false;
        rejections: readonly [ProductionLocationReconciliationRejection];
      }>);

export type ReconcileProductionLocationState = Readonly<{
  businessExists: boolean;
  stored: AccessProductionLocation | null;
}>;
