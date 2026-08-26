import { defineOperation } from '@pressly/cells';
import { completeMfaChallengeContract } from './contract.ts';
import type { CompleteMfaChallenge } from './complete-mfa-challenge.usecase.ts';
import {
  resultOperation,
  type OperationFailure,
  type OperationInput,
  type OperationOutput,
} from '../../../model/boundary/cell-contract.ts';

export const completeMfaChallengeCellDeclaration = defineOperation<
  OperationInput<CompleteMfaChallenge>,
  OperationOutput<CompleteMfaChallenge>,
  OperationFailure<CompleteMfaChallenge>
>({
  kind: 'command',
  id: 'access.complete-mfa-challenge.v1',
  authentication: 'none',
  contract: completeMfaChallengeContract,
  consistency: {
    transaction: 'required',
    concurrency: 'partitioned',
    concurrencyKey: (input) => input.challengeToken,
  },
  idempotency: { required: false },
  surfaces: [],
  observability: { operation: 'identity.complete_mfa_challenge' },
});

export const makeCompleteMfaChallengeCell = (operation: CompleteMfaChallenge) =>
  defineOperation(
    completeMfaChallengeCellDeclaration,
    resultOperation(operation),
  );
