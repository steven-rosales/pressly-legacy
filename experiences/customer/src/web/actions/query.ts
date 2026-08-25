import * as result from '@pressly/cells/result';
import type { Result } from '@pressly/cells/result';
import {
  normalizeUnknownError,
  type AppError,
} from '@pressly/errors/app-error';
import {
  attemptObservation,
  attemptObservationValue,
  type ObservationValueAttempt,
} from '@pressly/observability';
import type { RequestInput } from '../transport/model/request-client';
import type { WebCorePorts } from '../composition/model/ports';
import type { ActionMeta } from './action-meta';
import { observeWebActionFailure } from './observability';

type QueryRuntimePorts = Pick<
  WebCorePorts,
  'clock' | 'context' | 'errors' | 'logger' | 'request'
>;

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
  core: QueryRuntimePorts,
  meta: ActionMeta,
  appError: AppError,
): void => {
  observeWebActionFailure(core, meta, appError);
};

const recordQuerySuccess = (
  core: QueryRuntimePorts,
  meta: ActionMeta,
  startedAt: ObservationValueAttempt<Date>,
): void => {
  attemptObservation(() => {
    const context = core.context.get();
    const durationFields =
      startedAt.tag === 'observed'
        ? {
            durationMs: core.clock.now().getTime() - startedAt.value.getTime(),
          }
        : {};

    core.logger.debug('web query succeeded', {
      action: meta.action,
      ...durationFields,
      route: context.route,
    });
  });
};

export const createQueryRuntime = (core: QueryRuntimePorts): QueryRuntime =>
  Object.freeze({
    run: async <A>({
      meta,
      work,
    }: QueryRunInput<A>): Promise<Result<A, AppError>> => {
      const startedAt = attemptObservationValue(() => core.clock.now());

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
      const startedAt = attemptObservationValue(() => core.clock.now());

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
