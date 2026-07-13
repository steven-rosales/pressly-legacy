import { result } from '@pressly/kernel';
import { productionError } from '../production.error.ts';
import type { ClockPort } from '../production.port.ts';
import type {
  LoadProductionWorkspace,
  LoadProductionWorkspaceRepository,
} from './load-production-workspace.port.ts';

export const makeLoadProductionWorkspace =
  (deps: {
    repo: LoadProductionWorkspaceRepository;
    clock: ClockPort;
  }): LoadProductionWorkspace =>
  async ({ locationId }) => {
    const workspace = await deps.repo.loadWorkspace(
      locationId,
      deps.clock.now(),
    );

    return workspace === null
      ? result.err(
          productionError(
            'PRODUCTION_LOCATION_NOT_FOUND',
            'The active production location was not found.',
            404,
          ),
        )
      : result.ok(workspace);
  };

export type {
  LoadProductionWorkspace,
  LoadProductionWorkspaceRepository,
} from './load-production-workspace.port.ts';
