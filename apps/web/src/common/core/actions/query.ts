import { result, type Result } from '@pressly/kernel';
import { normalizeUnknownError, type AppError } from '@pressly/errors';
import type { RequestInput } from '../requests/request-client';
import type { WebCorePorts } from '../runtime/core';
import type { ActionMeta } from './action-meta';
import { observeWebActionFailure } from './observability';

export type QueryRunInput<A> = Readonly<{
  meta: ActionMeta;
  work: () => Promise<A>;
}>;

export type QueryFetchInput<A> = Readonly<{
  meta: ActionMeta;
  request: RequestInput<A>;
}>;

export type QueryRuntime = Readonly<{
  run: <A>(input: QueryRunInput<A>) => Promise<Result<A, AppError>>;
  fetch: <A>(input: QueryFetchInput<A>) => Promise<Result<A, AppError>>;
}>;

const recordQueryFailure = (
  core: WebCorePorts,
  meta: ActionMeta,
  appError: AppError,
): void => {
  observeWebActionFailure(core, meta, appError);
};

const recordQuerySuccess = (
  core: WebCorePorts,
  meta: ActionMeta,
  startedAt: Date,
): void => {
  const context = core.context.get();

  core.logger.debug('web query succeeded', {
    action: meta.action,
    durationMs: core.clock.now().getTime() - startedAt.getTime(),
    route: context.route,
  });
};

export const createQueryRuntime = (core: WebCorePorts): QueryRuntime =>
  Object.freeze({
    run: async <A>({
      meta,
      work,
    }: QueryRunInput<A>): Promise<Result<A, AppError>> => {
      const startedAt = core.clock.now();

      try {
        const value = await work();

        recordQuerySuccess(core, meta, startedAt);

        return result.ok(value);
      } catch (error) {
        const appError = normalizeUnknownError(error);

        recordQueryFailure(core, meta, appError);

        return result.err(appError);
      }
    },

    fetch: async <A>({
      meta,
      request,
    }: QueryFetchInput<A>): Promise<Result<A, AppError>> => {
      const startedAt = core.clock.now();

      try {
        const queryResult = await core.request.send(request);

        if (result.isOk(queryResult)) {
          recordQuerySuccess(core, meta, startedAt);
        } else {
          recordQueryFailure(core, meta, queryResult.error);
        }

        return queryResult;
      } catch (error) {
        const appError = normalizeUnknownError(error);

        recordQueryFailure(core, meta, appError);

        return result.err(appError);
      }
    },
  });
