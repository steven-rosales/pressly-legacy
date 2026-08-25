import type {
  ListHistoryActivityCursorInvalid,
  ListHistoryActivityLocationNotFound,
} from './types.ts';

export const listHistoryActivityLocationNotFound =
  (): ListHistoryActivityLocationNotFound => ({
    tag: 'ProductionFailure',
    kind: 'not_found',
    code: 'production_location_not_found',
    message: 'The production location was not found.',
    safeMessage: 'The production location was not found.',
  });

export const listHistoryActivityCursorInvalid =
  (): ListHistoryActivityCursorInvalid => ({
    tag: 'ProductionFailure',
    kind: 'validation',
    classification: 'malformed',
    code: 'production_history_cursor_invalid',
    message: 'The production-history cursor is invalid for these filters.',
    safeMessage: 'The production-history cursor is invalid for these filters.',
  });
