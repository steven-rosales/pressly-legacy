import type { AppError } from '@pressly/errors/app-error';
import {
  attemptObservation,
  decideObservation,
  type ErrorReportContext,
  type ObservationDecision,
  type ObservationLogLevel,
} from '@pressly/observability';
import type { Logger, LogFields } from '@pressly/logging';
import type { WebCorePorts } from '../runtime/ports';
import type { ActionMeta } from './action-meta';

type ObservationPorts = Pick<WebCorePorts, 'context' | 'errors' | 'logger'>;

const logWithLevel = (
  logger: Logger,
  level: ObservationLogLevel,
  message: string,
  fields: LogFields,
): void => {
  if (level === 'debug') logger.debug(message, fields);
  if (level === 'info') logger.info(message, fields);
  if (level === 'warn') logger.warn(message, fields);
  if (level === 'error') logger.error(message, fields);
  if (level === 'fatal') logger.fatal(message, fields);
};

const reportContext = (input: {
  meta: ActionMeta;
  appError: AppError;
  route: string;
  distinctId?: string;
  decision: ObservationDecision;
}): ErrorReportContext => ({
  source: 'web',
  operation: input.meta.action,
  route: input.route,
  traceId: input.appError.traceId,
  actorId: input.distinctId,
  tags: {
    rail: input.meta.rail,
    criticality: input.meta.criticality,
    reason: input.decision.reason,
    error_kind: input.appError.kind,
    error_code: input.appError.code,
    status: String(input.appError.status),
  },
});

export const observeWebActionFailure = (
  core: ObservationPorts,
  meta: ActionMeta,
  appError: AppError,
): void => {
  attemptObservation(() => {
    const context = core.context.get();
    const decision = decideObservation({
      kind: 'error',
      source: 'web',
      rail: meta.rail,
      operation: meta.action,
      route: context.route,
      criticality: meta.criticality,
      productCritical: meta.productCritical,
      error: {
        kind: appError.kind,
        code: appError.code,
        status: appError.status,
        traceId: appError.traceId,
      },
    });

    const logLevel = decision.logLevel;
    if (logLevel !== undefined)
      attemptObservation(() =>
        logWithLevel(core.logger, logLevel, 'web.action.failed', {
          action: meta.action,
          rail: meta.rail,
          criticality: meta.criticality,
          productCritical: meta.productCritical,
          kind: appError.kind,
          code: appError.code,
          status: appError.status,
          route: context.route,
          reason: decision.reason,
        }),
      );

    if (decision.report)
      attemptObservation(() =>
        core.errors.capture(
          appError,
          reportContext({
            meta,
            appError,
            route: context.route,
            distinctId: context.distinctId,
            decision,
          }),
        ),
      );
  });
};
