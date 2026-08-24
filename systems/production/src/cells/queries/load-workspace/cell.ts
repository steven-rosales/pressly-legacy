import { bindCell, declareQueryCell } from '@pressly/cells';
import type { ProductionWorkspace } from '../../../read-models/production-board/contract.ts';
import { loadWorkspaceContract } from './contract.ts';
import {
  makeExecuteLoadWorkspace,
  type LoadWorkspaceDependencies,
} from './execute.ts';
import {
  loadWorkspaceOperationId,
  type LoadWorkspaceExpectedFailure,
  type LoadWorkspaceInput,
} from './types.ts';

export const loadWorkspaceCellDeclaration = declareQueryCell<
  LoadWorkspaceInput,
  ProductionWorkspace,
  LoadWorkspaceExpectedFailure
>({
  id: loadWorkspaceOperationId,
  contract: loadWorkspaceContract,
  authorization: {
    capability: 'production:read',
    timing: 'after-input',
    scope: (input) => input.locationId,
  },
  consistency: { transaction: 'required', concurrency: 'none' },
  surfaces: [],
  observability: { operation: 'production.load_workspace' },
});

export const makeLoadWorkspaceCell = (
  dependencies: LoadWorkspaceDependencies,
) =>
  bindCell(
    loadWorkspaceCellDeclaration,
    makeExecuteLoadWorkspace(dependencies),
  );
