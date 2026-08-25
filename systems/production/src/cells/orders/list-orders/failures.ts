import type {
  ListOrdersCursorInvalid,
  ListOrdersLocationNotFound,
} from './types.ts';

export const listOrdersLocationNotFound = (): ListOrdersLocationNotFound => ({
  tag: 'ProductionFailure',
  kind: 'not_found',
  code: 'production_location_not_found',
  message: 'The production location was not found.',
  safeMessage: 'The production location was not found.',
});

export const listOrdersCursorInvalid = (): ListOrdersCursorInvalid => ({
  tag: 'ProductionFailure',
  kind: 'validation',
  classification: 'malformed',
  code: 'production_order_cursor_invalid',
  message: 'The production-order cursor is invalid.',
  safeMessage: 'The production-order cursor is invalid.',
});
