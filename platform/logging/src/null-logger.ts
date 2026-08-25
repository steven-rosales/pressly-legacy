import type { Logger } from './logger.js';

export const nullLogger: Logger = {
  child: () => nullLogger,
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  fatal: () => undefined,
};
