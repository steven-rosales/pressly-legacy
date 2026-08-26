import { defineOperation } from '@pressly/cells';
import { listWorkforceSecurityEventsContract } from './contract.ts';
import type { ListWorkforceSecurityEvents } from './list-workforce-security-events.usecase.ts';
import {
  resultOperation,
  type OperationFailure,
  type OperationInput,
  type OperationOutput,
} from '../../../../model/boundary/cell-contract.ts';

export const listWorkforceSecurityEventsCellDeclaration = defineOperation<
  OperationInput<ListWorkforceSecurityEvents>,
  OperationOutput<ListWorkforceSecurityEvents>,
  OperationFailure<ListWorkforceSecurityEvents>
>({
  kind: 'query',
  id: 'access.list-workforce-security-events.v1',
  authentication: 'required',
  contract: listWorkforceSecurityEventsContract,
  consistency: { transaction: 'required', concurrency: 'none' },
  surfaces: [],
  observability: { operation: 'identity.list_workforce_security_events' },
});

export const makeListWorkforceSecurityEventsCell = (
  operation: ListWorkforceSecurityEvents,
) =>
  defineOperation(
    listWorkforceSecurityEventsCellDeclaration,
    resultOperation(operation),
  );
