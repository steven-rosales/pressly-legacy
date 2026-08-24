import { assignStageMachinesIdempotency } from '@pressly/production-system/operations/floor/assign-stage-machines/idempotency';
import { freezeBatchMembershipIdempotency } from '@pressly/production-system/operations/floor/freeze-batch-membership/idempotency';
import { makeAssignStageMachinesPostgresRepository } from '@pressly/production-system/operations/floor/assign-stage-machines/postgres';
import { makeExecuteAssignStageMachines } from '@pressly/production-system/operations/floor/assign-stage-machines/execute';
import { makeExecuteFreezeBatchMembership } from '@pressly/production-system/operations/floor/freeze-batch-membership/execute';
import { makeExecuteReconcileBatchProgress } from '@pressly/production-system/operations/floor/reconcile-batch-progress/execute';
import { makeExecuteUnfreezeBatchMembership } from '@pressly/production-system/operations/floor/unfreeze-batch-membership/execute';
import { makeFreezeBatchMembershipPostgresRepository } from '@pressly/production-system/operations/floor/freeze-batch-membership/postgres';
import { makeReconcileBatchProgressPostgresRepository } from '@pressly/production-system/operations/floor/reconcile-batch-progress/postgres';
import { makeUnfreezeBatchMembershipPostgresRepository } from '@pressly/production-system/operations/floor/unfreeze-batch-membership/postgres';
import { reconcileBatchProgressIdempotency } from '@pressly/production-system/operations/floor/reconcile-batch-progress/idempotency';
import { unfreezeBatchMembershipIdempotency } from '@pressly/production-system/operations/floor/unfreeze-batch-membership/idempotency';
import { productionRules } from '@pressly/production-system/model';
import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';
import type { FloorRunners, MakeFloorRunnersInput } from './floor-runner.ts';

export const makeFloorRunners = (input: MakeFloorRunnersInput): FloorRunners =>
  Object.freeze({
    assignStageMachines: makeExecuteAssignStageMachines({
      repo: makeAssignStageMachinesPostgresRepository(
        {
          db: input.db,
          ids: input.ids,
        },
        presslyPostgresOwnerSchemas.production,
      ),
      idempotency: assignStageMachinesIdempotency,
      policy: productionRules,
      clock: input.clock,
    }),
    freezeBatchMembership: makeExecuteFreezeBatchMembership({
      repo: makeFreezeBatchMembershipPostgresRepository(
        {
          db: input.db,
          ids: input.ids,
        },
        presslyPostgresOwnerSchemas.production,
      ),
      idempotency: freezeBatchMembershipIdempotency,
      policy: productionRules,
      clock: input.clock,
      signals: input.signalRecorder.signals,
    }),
    unfreezeBatchMembership: makeExecuteUnfreezeBatchMembership({
      repo: makeUnfreezeBatchMembershipPostgresRepository(
        {
          db: input.db,
          ids: input.ids,
        },
        presslyPostgresOwnerSchemas.production,
      ),
      idempotency: unfreezeBatchMembershipIdempotency,
      policy: productionRules,
      clock: input.clock,
      signals: input.signalRecorder.signals,
    }),
    reconcileBatchProgress: makeExecuteReconcileBatchProgress({
      repo: makeReconcileBatchProgressPostgresRepository(
        {
          db: input.db,
          ids: input.ids,
        },
        presslyPostgresOwnerSchemas.production,
      ),
      idempotency: reconcileBatchProgressIdempotency,
      policy: productionRules,
      clock: input.clock,
      signals: input.signalRecorder.signals,
    }),
  });
