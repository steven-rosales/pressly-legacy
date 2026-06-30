export { nullLogger } from './null-logger.js';
export { isSensitiveKey, redactLogFields } from './redact.js';
export { nullSecurityEventSink } from './security-event.js';

export type {
  Logger,
  LogFields,
  LogLevel,
  LogPrimitive,
  LogValue,
} from './logger.js';
export type {
  SecurityEvent,
  SecurityEventName,
  SecurityEventSink,
} from './security-event.js';
