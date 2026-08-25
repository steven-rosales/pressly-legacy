import type {
  LoadHistoryRunLocationNotFound,
  LoadHistoryRunNotFound,
} from './types.ts';

export const loadHistoryRunLocationNotFound =
  (): LoadHistoryRunLocationNotFound => ({
    tag: 'ProductionFailure',
    kind: 'not_found',
    code: 'production_location_not_found',
    message: 'The production location was not found.',
    safeMessage: 'The production location was not found.',
  });

export const loadHistoryRunNotFound = (): LoadHistoryRunNotFound => ({
  tag: 'ProductionFailure',
  kind: 'not_found',
  code: 'production_history_run_not_found',
  message: 'The production run was not found at this location.',
  safeMessage: 'The production run was not found at this location.',
});
