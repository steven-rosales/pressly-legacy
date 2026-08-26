import { defineOperation } from '@pressly/cells';
import type { AccessExecute } from '../../../auth/model/access.ts';
import {
  type IdentityMutationInput,
  type RecoveryCodes,
} from '../../../auth/model/schemas.ts';
import { customerRegenerateMfaRecoveryCodesContract } from './contract.ts';
import { makeExecuteCustomerRegenerateMfaRecoveryCodes } from './execute.ts';
import { customerRegenerateMfaRecoveryCodesHttpSurface } from './http.ts';

export const customerRegenerateMfaRecoveryCodesCellDeclaration =
  defineOperation<IdentityMutationInput, RecoveryCodes, never>({
    kind: 'command',
    id: 'customer.regenerate-mfa-recovery-codes.v1',
    contract: customerRegenerateMfaRecoveryCodesContract,
    authorization: {
      capability: 'auth:mfa:manage',
      timing: 'after-input',
      scope: (input) => `auth.identity:${input.identityId}`,
    },
    consistency: { transaction: 'none', concurrency: 'none' },
    idempotency: { required: false },
    surfaces: [customerRegenerateMfaRecoveryCodesHttpSurface],
    observability: {
      operation: 'customer.authentication.regenerate_mfa_recovery_codes',
    },
  });

export const makeCustomerRegenerateMfaRecoveryCodesCell = (
  access: AccessExecute<'regenerateMfaRecoveryCodes'>,
) =>
  defineOperation(
    customerRegenerateMfaRecoveryCodesCellDeclaration,
    makeExecuteCustomerRegenerateMfaRecoveryCodes(access),
  );
