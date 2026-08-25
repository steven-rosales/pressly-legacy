import type {
  AccessProductionLocation,
  ProductionLocationReconciliationChange,
  ProductionLocationReconciliationRejection,
  ReconcileProductionLocationCommand,
  ReconcileProductionLocationResult,
  ReconcileProductionLocationState,
} from './types.ts';

const rejected = (
  command: ReconcileProductionLocationCommand,
  code: ProductionLocationReconciliationRejection['code'],
  message: string,
): ReconcileProductionLocationResult => ({
  mode: command.dryRun ? 'dry_run' : 'apply',
  status: 'rejected',
  operation: null,
  applied: false,
  rejections: [
    {
      resourceType: 'location',
      naturalKey: command.location.id,
      outcome: 'rejected',
      code,
      message,
    },
  ],
});

const changedFields = (
  stored: AccessProductionLocation,
  desired: AccessProductionLocation,
): readonly string[] =>
  (['name', 'timezone', 'isActive'] as const).filter(
    (field) => stored[field] !== desired[field],
  );

const operation = (
  command: ReconcileProductionLocationCommand,
  state: ReconcileProductionLocationState,
): ProductionLocationReconciliationChange => {
  if (state.stored === null)
    return {
      resourceType: 'location',
      naturalKey: command.location.id,
      outcome: 'created',
      changedFields: ['resource'],
    };
  const fields = changedFields(state.stored, command.location);
  return {
    resourceType: 'location',
    naturalKey: command.location.id,
    outcome: fields.length === 0 ? 'noop' : 'updated',
    changedFields: fields,
  };
};

export const decideReconcileProductionLocation = (
  command: ReconcileProductionLocationCommand,
  state: ReconcileProductionLocationState,
): ReconcileProductionLocationResult => {
  if (!state.businessExists)
    return rejected(
      command,
      'business_not_found',
      'The production location business does not exist.',
    );
  if (
    state.stored !== null &&
    state.stored.businessId !== command.location.businessId
  )
    return rejected(
      command,
      'natural_key_change',
      'A production location cannot move to another business.',
    );
  if (state.stored?.isActive === true && command.location.isActive === false)
    return rejected(
      command,
      'destructive_resource_deactivation',
      'Bootstrap cannot deactivate an existing production location.',
    );

  return {
    mode: command.dryRun ? 'dry_run' : 'apply',
    status: 'converged',
    operation: operation(command, state),
    applied: !command.dryRun,
    rejections: [],
  };
};
