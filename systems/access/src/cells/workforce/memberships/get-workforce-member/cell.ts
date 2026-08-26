import { defineOperation } from '@pressly/cells';
import { getWorkforceMemberContract } from './contract.ts';
import type { GetWorkforceMember } from './get-workforce-member.usecase.ts';
import {
  resultOperation,
  type OperationFailure,
  type OperationInput,
  type OperationOutput,
} from '../../../../model/boundary/cell-contract.ts';

export const getWorkforceMemberCellDeclaration = defineOperation<
  OperationInput<GetWorkforceMember>,
  OperationOutput<GetWorkforceMember>,
  OperationFailure<GetWorkforceMember>
>({
  kind: 'query',
  id: 'access.get-workforce-member.v1',
  authentication: 'required',
  contract: getWorkforceMemberContract,
  consistency: { transaction: 'required', concurrency: 'none' },
  surfaces: [],
  observability: { operation: 'identity.get_workforce_member' },
});

export const makeGetWorkforceMemberCell = (operation: GetWorkforceMember) =>
  defineOperation(
    getWorkforceMemberCellDeclaration,
    resultOperation(operation),
  );
