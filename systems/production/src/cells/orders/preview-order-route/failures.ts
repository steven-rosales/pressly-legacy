import type { PreviewOrderRouteNotFoundFailure } from './types.ts';

export const previewOrderRouteNotFound =
  (): PreviewOrderRouteNotFoundFailure => ({
    kind: 'not_found',
    code: 'production_order_route_not_found',
    message: 'The production run, order, or current batch was not found.',
    safeMessage: 'The production run, order, or current batch was not found.',
  });
