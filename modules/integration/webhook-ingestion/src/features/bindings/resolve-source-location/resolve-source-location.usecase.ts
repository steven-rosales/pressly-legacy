import { mapUnknownError, type AppError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type { SourceLocationBindingStore } from '../../../foundations/ports/source-location-binding-store/source-location-binding-store.port.ts';
import type { ResolveSourceLocation } from './resolve-source-location.port.ts';

const sourceLocationResolutionFailure = (cause: unknown): AppError =>
  mapUnknownError(cause, (unknownCause) =>
    databaseError({
      code: 'source_location_bindings_failed',
      message: 'Source-location bindings could not be managed.',
      safeMessage: 'Source-location bindings could not be managed.',
      status: 503,
      cause: unknownCause,
    }),
  );

export const makeResolveSourceLocation =
  (store: SourceLocationBindingStore): ResolveSourceLocation =>
  async (query) => {
    try {
      return await store.resolve(query);
    } catch (error) {
      throw sourceLocationResolutionFailure(error);
    }
  };
