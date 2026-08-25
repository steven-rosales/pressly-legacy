import { bindCell, declareQueryCell } from '@pressly/cells';
import { previewWorkforceInvitationContract } from './contract.ts';
import type { PreviewWorkforceInvitation } from './preview-workforce-invitation.usecase.ts';
import {
  resultOperation,
  type OperationFailure,
  type OperationInput,
  type OperationOutput,
} from '../../../../model/boundary/cell-contract.ts';

export const previewWorkforceInvitationCellDeclaration = declareQueryCell<
  OperationInput<PreviewWorkforceInvitation>,
  OperationOutput<PreviewWorkforceInvitation>,
  OperationFailure<PreviewWorkforceInvitation>
>({
  id: 'access.preview-workforce-invitation.v1',
  authentication: 'none',
  contract: previewWorkforceInvitationContract,
  consistency: { transaction: 'required', concurrency: 'none' },
  surfaces: [],
  observability: { operation: 'identity.preview_workforce_invitation' },
});

export const makePreviewWorkforceInvitationCell = (
  operation: PreviewWorkforceInvitation,
) =>
  bindCell(
    previewWorkforceInvitationCellDeclaration,
    resultOperation(operation),
  );
