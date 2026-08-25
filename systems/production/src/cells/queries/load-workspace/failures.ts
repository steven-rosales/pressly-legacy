import type {
  LoadWorkspaceLivePlacementConflict,
  LoadWorkspaceLocationNotFound,
  LoadWorkspaceShiftNotFound,
} from './types.ts';

export const loadWorkspaceLocationNotFound =
  (): LoadWorkspaceLocationNotFound => ({
    tag: 'ProductionFailure',
    kind: 'not_found',
    code: 'production_location_not_found',
    message: 'The active production location was not found.',
    safeMessage: 'The active production location was not found.',
  });

export const loadWorkspaceShiftNotFound = (): LoadWorkspaceShiftNotFound => ({
  tag: 'ProductionFailure',
  kind: 'not_found',
  code: 'production_shift_not_found',
  message: 'The requested production shift was not found at this location.',
  safeMessage: 'The requested production shift was not found at this location.',
});

export const loadWorkspaceLivePlacementConflict =
  (): LoadWorkspaceLivePlacementConflict => ({
    tag: 'ProductionFailure',
    kind: 'conflict',
    code: 'production_live_placement_run_mismatch',
    message:
      'The live-placement projection does not match the selected started run.',
    safeMessage:
      'The live-placement projection does not match the selected started run.',
  });
