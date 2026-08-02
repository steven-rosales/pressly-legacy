import { isAppError } from '@pressly/errors';

const sensitiveKeyPattern =
  /(password|secret|token|credential|api[_-]?key|authorization|cookie|dsn|database[_-]?url|request[_-]?body|mfa|recovery[_-]?codes?)/i;

const redacted = '[REDACTED]';

export const isSensitiveKey = (key: string): boolean =>
  sensitiveKeyPattern.test(key);

const redactSensitiveText = (value: string): string =>
  value
    .replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/:@]+:[^\s@]+@/gi, '$1[REDACTED]@');

export const redactLogFields = (value: unknown, depth = 0): unknown => {
  if (depth > 8) return '[MAX_DEPTH]';

  if (value === null || value === undefined) return value;

  if (typeof value === 'string') return redactSensitiveText(value);

  if (typeof value !== 'object') return value;

  if (value instanceof Error) {
    const base = {
      name: redactSensitiveText(value.name),
      message: redactSensitiveText(value.message),
      stack:
        value.stack === undefined
          ? undefined
          : redactSensitiveText(value.stack),
    };

    if (!isAppError(value))
      return {
        ...base,
        ...(value.cause === undefined
          ? {}
          : { cause: redactLogFields(value.cause, depth + 1) }),
      };

    return {
      ...base,
      tag: value.tag,
      kind: value.kind,
      code: value.code,
      safeMessage: redactSensitiveText(value.safeMessage),
      status: value.status,
      ...(value.traceId === undefined ? {} : { traceId: value.traceId }),
      ...(value.details === undefined
        ? {}
        : { details: redactLogFields(value.details, depth + 1) }),
      ...(value.publicDetails === undefined
        ? {}
        : { publicDetails: redactLogFields(value.publicDetails, depth + 1) }),
      ...(value.cause === undefined
        ? {}
        : { cause: redactLogFields(value.cause, depth + 1) }),
    };
  }

  if (Array.isArray(value))
    return value.map((item) => redactLogFields(item, depth + 1));

  return Object.fromEntries(
    Object.entries(value).map(([key, fieldValue]) => [
      key,
      isSensitiveKey(key) ? redacted : redactLogFields(fieldValue, depth + 1),
    ]),
  );
};
