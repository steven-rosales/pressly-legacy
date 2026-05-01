import {
  err,
  normalizeUnknownError,
  ok,
  type AppError,
  type Result,
} from '@pressly/errors';
import type { WebCore } from '../runtime/core';
import type { ActionMeta } from './action-meta';

export type QueryRunner = <A>(
  meta: ActionMeta,
  work: () => Promise<A>,
) => Promise<Result<A, AppError>>;

const shouldReportQueryFailure = (meta: ActionMeta): boolean =>
  meta.criticality === 'medium' || meta.criticality === 'high';

export const makeQueryRunner =
  (core: WebCore): QueryRunner =>
  async (meta, work) => {
    const startedAt = core.clock.now();
    const context = core.context.get();

    try {
      const value = await work();

      core.logger.debug('web query succeeded', {
        action: meta.action,
        durationMs: core.clock.now().getTime() - startedAt.getTime(),
        route: context.route,
      });

      return ok(value);
    } catch (error) {
      const appError = normalizeUnknownError(error);

      core.logger.warn('web query failed', {
        action: meta.action,
        kind: appError.kind,
        code: appError.code,
        status: appError.status,
        route: context.route,
      });

      if (shouldReportQueryFailure(meta)) {
        core.errors.capture(appError, {
          source: 'web',
          operation: meta.action,
          route: context.route,
          actorId: context.distinctId,
          tags: {
            rail: meta.rail,
            criticality: meta.criticality,
          },
        });
      }

      return err(appError);
    }
  };
