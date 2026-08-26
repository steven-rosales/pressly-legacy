import { defineOperation } from '@pressly/cells';
import type { AccessExecute } from '../../../auth/model/access.ts';
import {
  type MfaMutation,
  type RemoveMfaInput,
} from '../../../auth/model/schemas.ts';
import { customerRemoveMfaContract } from './contract.ts';
import { makeExecuteCustomerRemoveMfa } from './execute.ts';
import { customerRemoveMfaHttpSurface } from './http.ts';

export const customerRemoveMfaCellDeclaration = defineOperation<
  RemoveMfaInput,
  MfaMutation,
  never
>({
  kind: 'command',
  id: 'customer.remove-mfa.v1',
  contract: customerRemoveMfaContract,
  authorization: {
    capability: 'auth:mfa:manage',
    timing: 'after-input',
    scope: (input) => `auth.identity:${input.identityId}`,
  },
  consistency: { transaction: 'none', concurrency: 'none' },
  idempotency: { required: false },
  surfaces: [customerRemoveMfaHttpSurface],
  observability: { operation: 'customer.authentication.remove_mfa' },
});

export const makeCustomerRemoveMfaCell = (access: AccessExecute<'removeMfa'>) =>
  defineOperation(
    customerRemoveMfaCellDeclaration,
    makeExecuteCustomerRemoveMfa(access),
  );
