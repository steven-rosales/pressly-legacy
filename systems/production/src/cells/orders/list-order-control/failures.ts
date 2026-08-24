import type {
  ListOrderControlCursorInvalid,
  ListOrderControlLocationNotFound,
} from './types.ts';

export const listOrderControlLocationNotFound =
  (): ListOrderControlLocationNotFound => ({
    tag: 'ProductionFailure',
    kind: 'not_found',
    code: 'production_location_not_found',
    message: 'The production location was not found.',
    safeMessage: 'The production location was not found.',
  });

export const listOrderControlCursorInvalid =
  (): ListOrderControlCursorInvalid => ({
    tag: 'ProductionFailure',
    kind: 'validation',
    classification: 'malformed',
    code: 'production_order_cursor_invalid',
    message: 'The production-order cursor is invalid.',
    safeMessage: 'The production-order cursor is invalid.',
  });
