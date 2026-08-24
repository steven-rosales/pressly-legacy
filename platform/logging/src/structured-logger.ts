import type { Logger, LogFields, LogLevel, LogPrimitive } from './logger.js';
import { isSensitiveKey, redactLogFields } from './redact.js';

export type StructuredLogAttribute = Exclude<LogPrimitive, null | undefined>;

export type StructuredLogRecord = Readonly<{
  level: LogLevel;
  message: string;
  attributes: Readonly<Record<string, StructuredLogAttribute>>;
}>;

export type StructuredLogWriter = (record: StructuredLogRecord) => void;

const maximumAttributeCount = 32;
const maximumAttributeKeyLength = 80;
const maximumAttributeValueLength = 256;
const maximumMessageLength = 512;
const maximumDepth = 3;

const unsafeDiagnosticKeyPattern =
  /(^|[._-])(body|payload|headers?|cookies?|sql|query|parameters?|customer|email|phone|address|message|stack|cause|details|publicdetails)([._-]|$)/i;

const identifierKeyPattern = /(?:^|[._-])[^.]*id$|Id$/i;
const allowedIdentifierKeys = new Set([
  'requestId',
  'request_id',
  'sentry.trace.parent_span_id',
]);

const safeAttributeKey = (key: string): boolean =>
  key.length > 0 &&
  key.length <= maximumAttributeKeyLength &&
  !isSensitiveKey(key) &&
  !unsafeDiagnosticKeyPattern.test(key) &&
  (!identifierKeyPattern.test(key) || allowedIdentifierKeys.has(key));

const boundedString = (value: string): string =>
  value.length <= maximumAttributeValueLength
    ? value
    : `${value.slice(0, maximumAttributeValueLength - 11)}[TRUNCATED]`;

const boundedMessage = (message: string): string =>
  message.length <= maximumMessageLength
    ? message
    : `${message.slice(0, maximumMessageLength - 11)}[TRUNCATED]`;

const primitiveAttribute = (
  value: unknown,
): StructuredLogAttribute | undefined => {
  if (typeof value === 'string') return boundedString(value);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return undefined;
};

const primitiveArrayAttribute = (
  value: readonly unknown[],
): string | undefined => {
  if (value.length === 0 || value.length > 8) return undefined;
  const primitives = value.map(primitiveAttribute);
  if (primitives.some((item) => item === undefined)) return undefined;
  return boundedString(primitives.join(','));
};

const appendAttributes = (
  output: Record<string, StructuredLogAttribute>,
  value: unknown,
  prefix: string,
  depth: number,
): void => {
  if (Object.keys(output).length >= maximumAttributeCount) return;

  const primitive = primitiveAttribute(value);
  if (primitive !== undefined) {
    if (safeAttributeKey(prefix)) output[prefix] = primitive;
    return;
  }

  if (Array.isArray(value)) {
    const arrayValue = primitiveArrayAttribute(value);
    if (arrayValue !== undefined && safeAttributeKey(prefix))
      output[prefix] = arrayValue;
    return;
  }

  if (depth >= maximumDepth || value === null || typeof value !== 'object')
    return;

  for (const [key, nested] of Object.entries(value)) {
    const qualifiedKey = prefix.length === 0 ? key : `${prefix}.${key}`;
    if (!safeAttributeKey(qualifiedKey)) continue;
    appendAttributes(output, nested, qualifiedKey, depth + 1);
    if (Object.keys(output).length >= maximumAttributeCount) return;
  }
};

export const toStructuredLogAttributes = (
  fields: Readonly<Record<string, unknown>>,
): Readonly<Record<string, StructuredLogAttribute>> => {
  const output: Record<string, StructuredLogAttribute> = {};
  appendAttributes(output, redactLogFields(fields), '', 0);
  return Object.freeze(output);
};

export const toStructuredLogMessage = (message: string): string => {
  const redacted = redactLogFields(message);
  return boundedMessage(typeof redacted === 'string' ? redacted : 'log');
};

export const makeStructuredLogger = (input: {
  fields: LogFields;
  write: StructuredLogWriter;
  onWriteFailure?: (failure: unknown, record: StructuredLogRecord) => void;
}): Logger => {
  const create = (inheritedFields: LogFields): Logger => {
    const log = (
      level: LogLevel,
      message: string,
      fields?: LogFields,
    ): void => {
      const record: StructuredLogRecord = Object.freeze({
        level,
        message: toStructuredLogMessage(message),
        attributes: toStructuredLogAttributes({
          ...inheritedFields,
          ...fields,
        }),
      });

      try {
        input.write(record);
      } catch (failure: unknown) {
        try {
          input.onWriteFailure?.(failure, record);
        } catch {
          // Logging is non-authoritative and must never replace application work.
        }
      }
    };

    return Object.freeze({
      child: (fields: LogFields) => create({ ...inheritedFields, ...fields }),
      debug: (message: string, fields?: LogFields) =>
        log('debug', message, fields),
      info: (message: string, fields?: LogFields) =>
        log('info', message, fields),
      warn: (message: string, fields?: LogFields) =>
        log('warn', message, fields),
      error: (message: string, fields?: LogFields) =>
        log('error', message, fields),
      fatal: (message: string, fields?: LogFields) =>
        log('fatal', message, fields),
    });
  };

  return create(input.fields);
};
