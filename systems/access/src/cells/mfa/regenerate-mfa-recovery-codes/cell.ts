import { bindCell, declareCommandCell } from '@pressly/cells';
import { regenerateMfaRecoveryCodesContract } from './contract.ts';
import type { RegenerateMfaRecoveryCodes } from './regenerate-mfa-recovery-codes.usecase.ts';
import {
  successOperation,
  type OperationFailure,
  type OperationInput,
  type OperationOutput,
} from '../../../model/boundary/cell-contract.ts';

export const regenerateMfaRecoveryCodesCellDeclaration = declareCommandCell<
  OperationInput<RegenerateMfaRecoveryCodes>,
  OperationOutput<RegenerateMfaRecoveryCodes>,
  OperationFailure<RegenerateMfaRecoveryCodes>
>({
  id: 'access.regenerate-mfa-recovery-codes.v1',
  authentication: 'required',
  contract: regenerateMfaRecoveryCodesContract,
  consistency: {
    transaction: 'required',
    concurrency: 'partitioned',
    concurrencyKey: (input) => input.identityId,
  },
  idempotency: { required: false },
  surfaces: [],
  observability: { operation: 'identity.regenerate_mfa_recovery_codes' },
});

export const makeRegenerateMfaRecoveryCodesCell = (
  operation: RegenerateMfaRecoveryCodes,
) =>
  bindCell(
    regenerateMfaRecoveryCodesCellDeclaration,
    successOperation(operation),
  );
