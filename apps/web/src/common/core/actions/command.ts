import { normalizeUnknownError, AppException } from '@pressly/errors';
import type { WebCore } from '../runtime/core';
import type { ActionMeta, CommandFeedback } from './action-meta';

export type CommandRunner = <A>(
  meta: ActionMeta,
  work: () => Promise<A>,
  feedback?: CommandFeedback,
) => Promise<A>;

const feedbackTitleForError = (
  fallback: string | undefined,
  safeMessage: string,
): string => fallback ?? safeMessage;

export const makeCommandRunner =
  (core: WebCore): CommandRunner =>
  async (meta, work, feedback) => {
    const startedAt = core.clock.now();
    const context = core.context.get();

    const loadingId =
      feedback?.loading === undefined
        ? undefined
        : core.feedback.loading({ title: feedback?.loading });

    core.logger.info('web command started', {
      action: meta.action,
      rail: meta.rail,
      criticality: meta.criticality,
      source: meta.source,
      route: context.route,
    });

    try {
      const value = await work();

      if (loadingId !== undefined) core.feedback.dismiss(loadingId);
      if (feedback?.success !== undefined)
        core.feedback.success({ title: feedback.success });

      core.logger.info('web command succeeded', {
        action: meta.action,
        durationMs: core.clock.now().getTime() - startedAt.getTime(),
        route: context.route,
      });

      return value;
    } catch (error) {
      const appError = normalizeUnknownError(error);

      if (loadingId !== undefined) core.feedback.dismiss(loadingId);
      if (feedback?.error !== undefined)
        core.feedback.error({
          title: feedbackTitleForError(feedback.error, appError.safeMessage),
        });

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

      core.logger.error('web command failed', {
        action: meta.action,
        kind: appError.kind,
        code: appError.code,
        status: appError.status,
        route: context.route,
      });

      throw new AppException(appError);
    }
  };
