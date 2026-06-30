const sensitiveKeyPattern =
  /(password|secret|token|credential|api[_-]?key|authorization|cookie|dsn|database[_-]?url|request[_-]?body)/i;

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

  if (value instanceof Error)
    return {
      name: redactSensitiveText(value.name),
      message: redactSensitiveText(value.message),
      stack:
        value.stack === undefined
          ? undefined
          : redactSensitiveText(value.stack),
    };

  if (Array.isArray(value))
    return value.map((item) => redactLogFields(item, depth + 1));

  return Object.fromEntries(
    Object.entries(value).map(([key, fieldValue]) => [
      key,
      isSensitiveKey(key) ? redacted : redactLogFields(fieldValue, depth + 1),
    ]),
  );
};
