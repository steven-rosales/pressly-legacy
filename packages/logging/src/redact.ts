const sensitiveKeyPattern =
  /(password|secret|token|api[_-]?key|authorization|cookie|dsn|database[_-]?url)/i;

const redacted = '[REDACTED]';

export const isSensitiveKey = (key: string): boolean =>
  sensitiveKeyPattern.test(key);

export const redactLogFields = (value: unknown, depth = 0): unknown => {
  if (depth > 8) return '[MAX_DEPTH]';

  if (value === null || value === undefined) return value;

  if (typeof value !== 'object') return value;

  if (value instanceof Error)
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
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
