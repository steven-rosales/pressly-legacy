import {
  redactLogFields,
  type Logger,
  type LogFields,
  type LogLevel,
} from '@pressly/logging';

const write = (level: LogLevel, message: string, fields?: LogFields): void => {
  const payload = {
    level,
    message,
    ...(fields === undefined ? {} : (redactLogFields(fields) as object)),
  };

  if (level === 'error' || level === 'fatal') {
    console.error(payload);
    return;
  }

  if (level === 'warn') {
    console.warn(payload);
    return;
  }

  if (level === 'debug') {
    console.debug(payload);
    return;
  }

  console.info(payload);
};

export const makeConsoleLogger = (baseFields: LogFields = {}): Logger => {
  const child = (childFields: LogFields): Logger =>
    makeConsoleLogger({ ...baseFields, ...childFields });

  const withBase = (fields?: LogFields): LogFields => ({
    ...baseFields,
    ...(fields ?? {}),
  });

  return {
    child,
    debug: (message, fields) => write('debug', message, withBase(fields)),
    info: (message, fields) => write('info', message, withBase(fields)),
    warn: (message, fields) => write('warn', message, withBase(fields)),
    error: (message, fields) => write('error', message, withBase(fields)),
    fatal: (message, fields) => write('fatal', message, withBase(fields)),
  };
};
