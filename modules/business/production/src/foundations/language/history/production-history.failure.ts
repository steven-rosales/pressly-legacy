import {
  notFoundFailure,
  validationFailure,
} from '../failures/production-failure.factory.ts';

export const productionHistoryLocationNotFound = () =>
  notFoundFailure({
    code: 'production_location_not_found',
    message: 'The production location was not found.',
    safeMessage: 'The production location was not found.',
  });

export const productionHistoryCursorInvalid = () =>
  validationFailure({
    code: 'production_history_cursor_invalid',
    message: 'The production-history cursor is invalid for these filters.',
    safeMessage: 'The production-history cursor is invalid for these filters.',
  });

export const productionHistoryRunNotFound = () =>
  notFoundFailure({
    code: 'production_history_run_not_found',
    message: 'The production run was not found at this location.',
    safeMessage: 'The production run was not found at this location.',
  });
