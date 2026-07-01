import { normalizeUnknownError } from '@pressly/errors';
import type { WebCorePorts } from '../runtime/core';
import type { ActionMeta, CommandFeedback } from './action-meta';
import { observeWebActionFailure } from './observability';

export type CommandRunInput<A> = Readonly<{
  meta: ActionMeta;
  work: () => Promise<A>;
  feedback?: CommandFeedback;
}>;

export type CommandRuntime = Readonly<{
  run: <A>(input: CommandRunInput<A>) => Promise<A>;
}>;

const feedbackTitleForError = (
  fallback: string | undefined,
  safeMessage: string,
): string => fallback ?? safeMessage;

export const createCommandRuntime = (core: WebCorePorts): CommandRuntime =>
  Object.freeze({
    run: async <A>({
      meta,
      work,
      feedback,
    }: CommandRunInput<A>): Promise<A> => {
      const startedAt = core.clock.now();
      const context = core.context.get();

      const loadingId =
        feedback?.loading === undefined
          ? undefined
          : core.feedback.loading({ title: feedback?.loading });

      try {
        const value = await work();

        if (loadingId !== undefined) core.feedback.dismiss(loadingId);
        if (feedback?.success !== undefined)
          core.feedback.success({ title: feedback.success });

        core.logger.debug('web command succeeded', {
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

        observeWebActionFailure(core, meta, appError);

        throw appError;
      }
    },
  });
