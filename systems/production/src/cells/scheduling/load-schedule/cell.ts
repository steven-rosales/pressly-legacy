import type { ScheduleProposal } from '../../../read-models/production-schedule/contract.ts';
import { defineOperation } from '@pressly/cells';
import { loadScheduleContract } from './contract.ts';
import { makeExecuteLoadSchedule } from './execute.ts';
import { loadScheduleHttpSurfaces } from './http.ts';
import {
  loadScheduleOperationId,
  type LoadScheduleExpectedFailure,
  type LoadScheduleInput,
  type LoadScheduleRepository,
} from './types.ts';

export const loadScheduleCellDeclaration = defineOperation<
  LoadScheduleInput,
  ScheduleProposal,
  LoadScheduleExpectedFailure
>({
  kind: 'query',
  id: loadScheduleOperationId,
  contract: loadScheduleContract,
  authorization: {
    capability: 'production:read',
    timing: 'after-input',
    scope: (input) => input.locationId,
  },
  surfaces: loadScheduleHttpSurfaces,
  observability: { operation: 'production.load_schedule' },
});

export const makeLoadScheduleCell = (repository: LoadScheduleRepository) =>
  defineOperation(
    loadScheduleCellDeclaration,
    makeExecuteLoadSchedule(repository),
  );
