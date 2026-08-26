import { defineOperation } from '@pressly/cells';
import { loadSessionContract } from './contract.ts';
import type { LoadSession } from './load-session.usecase.ts';
import {
  resultOperation,
  type OperationFailure,
  type OperationInput,
  type OperationOutput,
} from '../../../model/boundary/cell-contract.ts';

export const loadSessionCellDeclaration = defineOperation<
  OperationInput<LoadSession>,
  OperationOutput<LoadSession>,
  OperationFailure<LoadSession>
>({
  kind: 'query',
  id: 'access.load-session.v1',
  authentication: 'none',
  contract: loadSessionContract,
  consistency: { transaction: 'none', concurrency: 'none' },
  surfaces: [],
  observability: { operation: 'identity.load_session' },
});

export const makeLoadSessionCell = (operation: LoadSession) =>
  defineOperation(loadSessionCellDeclaration, resultOperation(operation));
