import pino, { type Logger as PinoLogger } from 'pino';
import {
  redactLogFields,
  type Logger,
  type LogFields,
  type LogLevel,
} from '@pressly/logging';

const toFields = (fields: LogFields | undefined): Record<string, unknown> =>
  fields === undefined
    ? {}
    : (redactLogFields(fields) as Record<string, unknown>);

const fromPino = (logger: PinoLogger): Logger => ({
  child: (fields) => fromPino(logger.child(toFields(fields))),
  debug: (message, fields) => logger.debug(toFields(fields), message),
  info: (message, fields) => logger.info(toFields(fields), message),
  warn: (message, fields) => logger.warn(toFields(fields), message),
  error: (message, fields) => logger.error(toFields(fields), message),
  fatal: (message, fields) => logger.fatal(toFields(fields), message),
});

export const makePinoLogger = (input: {
  level: LogLevel;
  environment: string;
}): Logger =>
  fromPino(
    pino({
      level: input.level,
      base: { service: 'api', environment: input.environment },
    }),
  );
