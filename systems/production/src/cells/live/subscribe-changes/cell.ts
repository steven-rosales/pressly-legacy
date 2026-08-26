import { defineOperation } from '@pressly/cells';
import { subscribeProductionChangesContract } from './contract.ts';
import {
  makeOpenProductionChanges,
  type SubscribeProductionChangesDependencies,
} from './execute.ts';
import { subscribeProductionChangesHttpSurface } from './http.ts';
import type {
  ProductionChangeEvent,
  SubscribeProductionChangesFailure,
  SubscribeProductionChangesInput,
  SubscribeProductionChangesReady,
} from './types.ts';

export const subscribeProductionChangesOperationId =
  'production.subscribe-changes.v1';

export const subscribeProductionChangesCellDeclaration = defineOperation<
  SubscribeProductionChangesInput,
  SubscribeProductionChangesReady,
  ProductionChangeEvent,
  SubscribeProductionChangesFailure
>({
  kind: 'subscription',
  id: subscribeProductionChangesOperationId,
  contract: subscribeProductionChangesContract,
  authorization: {
    capability: 'production:read',
    timing: 'before-input',
  },
  surfaces: [subscribeProductionChangesHttpSurface],
  observability: { operation: 'production.subscribe_changes' },
});

export const makeSubscribeProductionChangesCell = (
  dependencies: SubscribeProductionChangesDependencies,
) =>
  defineOperation(
    subscribeProductionChangesCellDeclaration,
    makeOpenProductionChanges(dependencies),
  );
