import { defineOperation } from '@pressly/cells';
import { publishSchedulerConfigContract } from './contract.ts';
import { publishSchedulerConfigOperationId } from './decide.ts';
import {
  makeExecutePublishSchedulerConfig,
  type PublishSchedulerConfigDependencies,
} from './execute.ts';
import { publishSchedulerConfigHttpSurfaces } from './http.ts';
import type {
  PublishSchedulerConfigCommand,
  PublishSchedulerConfigExpectedFailure,
  SchedulerConfig,
} from './types.ts';

export const publishSchedulerConfigCellDeclaration = defineOperation<
  PublishSchedulerConfigCommand,
  SchedulerConfig,
  PublishSchedulerConfigExpectedFailure
>({
  kind: 'command',
  id: publishSchedulerConfigOperationId,
  contract: publishSchedulerConfigContract,
  authorization: {
    capability: 'production:schedule',
    timing: 'after-input',
    scope: (input) => input.locationId,
  },
  consistency: {
    transaction: 'required',
    concurrency: 'partitioned',
    concurrencyKey: (input) => input.locationId,
  },
  idempotency: { required: true, key: (input) => input.idempotencyKey },
  surfaces: publishSchedulerConfigHttpSurfaces,
  emits: [],
  consumes: [],
  observability: { operation: 'production.publish_scheduler_config' },
});

export const makePublishSchedulerConfigCell = <StoredWorkEvent>(
  deps: PublishSchedulerConfigDependencies<StoredWorkEvent>,
) =>
  defineOperation(
    publishSchedulerConfigCellDeclaration,
    makeExecutePublishSchedulerConfig(deps),
  );
