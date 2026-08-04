import { redactLogFields, type Logger, type LogFields } from '@pressly/logging';
import type { ObservationLogLevel } from '@pressly/observability';

export const toObservationLogFields = (
  fields: Readonly<Record<string, unknown>>,
): LogFields => redactLogFields(fields) as LogFields;

export const logObservation = (
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
