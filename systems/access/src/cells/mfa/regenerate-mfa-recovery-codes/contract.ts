import { z } from 'zod';
import type { RegenerateMfaRecoveryCodes } from './regenerate-mfa-recovery-codes.usecase.ts';
import {
  defineAccessCellContract,
  exactOptionalContractSchema,
  type OperationFailure,
  type OperationInput,
  type OperationOutput,
} from '../../../model/boundary/cell-contract.ts';
import { noExpectedFailureSchema } from '../../../model/boundary/schemas.ts';

export const regenerateMfaRecoveryCodesContract = defineAccessCellContract<
  OperationInput<RegenerateMfaRecoveryCodes>,
  OperationOutput<RegenerateMfaRecoveryCodes>,
  OperationFailure<RegenerateMfaRecoveryCodes>
>({
  label: 'access.regenerate-mfa-recovery-codes.v1',
  input: exactOptionalContractSchema<
    OperationInput<RegenerateMfaRecoveryCodes>
  >(
    z
      .object({ identityId: z.string(), requestId: z.string().optional() })
      .strict(),
  ),
  output: z.object({ recoveryCodes: z.array(z.string()) }).strict(),
  failure: noExpectedFailureSchema,
});
