import { bindCell, declareCommandCell } from '@pressly/cells';
import {
  resultOperation,
  type OperationFailure,
  type OperationOutput,
} from '../../../../model/boundary/cell-contract.ts';
import type {
  TransitionWorkforceMembership,
  TransitionWorkforceMembershipOperation,
  TransitionWorkforceMembershipOperationCommand,
} from './transition-workforce-membership.usecase.ts';
import { transitionWorkforceMembershipContract } from './contract.ts';

export const transitionWorkforceMembershipCellDeclaration = declareCommandCell<
  TransitionWorkforceMembershipOperationCommand,
  OperationOutput<TransitionWorkforceMembership>,
  OperationFailure<TransitionWorkforceMembership>
>({
  id: 'access.transition-workforce-membership.v1',
  authentication: 'required',
  contract: transitionWorkforceMembershipContract,
  consistency: {
    transaction: 'required',
    concurrency: 'optimistic',
    expectedVersion: (input) => input.expectedVersion,
  },
  idempotency: {
    required: true,
    key: (input) => input.idempotencyKey,
  },
  surfaces: [],
  observability: { operation: 'identity.transition_workforce_membership' },
});

export const makeTransitionWorkforceMembershipCell = (
  operation: TransitionWorkforceMembershipOperation,
) =>
  bindCell(
    transitionWorkforceMembershipCellDeclaration,
    resultOperation(operation),
  );
