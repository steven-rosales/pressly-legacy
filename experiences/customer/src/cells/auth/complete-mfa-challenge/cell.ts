import { defineOperation } from '@pressly/cells';
import { customerCompleteMfaChallengeContract } from './contract.ts';
import {
  makeExecuteCustomerCompleteMfaChallenge,
  type CustomerCompleteMfaChallengeDependencies,
} from './execute.ts';
import { customerCompleteMfaChallengeHttpSurface } from './http.ts';

export const customerCompleteMfaChallengeCellDeclaration = defineOperation({
  kind: 'command',
  id: 'customer.complete-mfa-challenge.v1',
  authentication: 'none',
  contract: customerCompleteMfaChallengeContract,
  consistency: { transaction: 'none', concurrency: 'none' },
  idempotency: { required: false },
  surfaces: [customerCompleteMfaChallengeHttpSurface],
  observability: {
    operation: 'customer.authentication.complete_mfa_challenge',
  },
});

export const makeCustomerCompleteMfaChallengeCell = (
  dependencies: CustomerCompleteMfaChallengeDependencies,
) =>
  defineOperation(
    customerCompleteMfaChallengeCellDeclaration,
    makeExecuteCustomerCompleteMfaChallenge(dependencies),
  );
