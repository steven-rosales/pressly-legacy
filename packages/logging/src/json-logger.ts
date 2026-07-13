import type { Logger, LogFields, LogLevel } from './logger.js';
import { redactLogFields } from './redact.js';

export type JsonLogWriter = (line: string, level: LogLevel) => void;

const defaultWriter: JsonLogWriter = (line, level) => {
  if (level === 'error' || level === 'fatal') {
    console.error(line);
    return;
  }

  console.log(line);
};

export const makeJsonLogger = (input: {
  service: string;
  environment: string;
  release?: string;
  clock?: Readonly<{ now: () => Date }>;
  write?: JsonLogWriter;
}): Logger => {
  const clock = input.clock ?? { now: () => new Date() };
  const write = input.write ?? defaultWriter;
  const rootFields: LogFields = {
    service: input.service,
    environment: input.environment,
    ...(input.release === undefined ? {} : { release: input.release }),
  };

  const create = (inheritedFields: LogFields): Logger => {
    const log = (
      level: LogLevel,
      message: string,
      fields?: LogFields,
    ): void => {
      const context = redactLogFields({
        ...inheritedFields,
        ...fields,
      }) as Record<string, unknown>;

      write(
        JSON.stringify({
          ...context,
          timestamp: clock.now().toISOString(),
          level,
          message: redactLogFields(message),
        }),
        level,
      );
    };

    return {
      child: (fields) => create({ ...inheritedFields, ...fields }),
      debug: (message, fields) => log('debug', message, fields),
      info: (message, fields) => log('info', message, fields),
      warn: (message, fields) => log('warn', message, fields),
      error: (message, fields) => log('error', message, fields),
      fatal: (message, fields) => log('fatal', message, fields),
    };
  };

  return create(rootFields);
};
