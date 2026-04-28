export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export type LogPrimitive = string | number | boolean | null | undefined;

export type LogValue =
  | LogPrimitive
  | Error
  | readonly LogValue[]
  | { readonly [key: string]: LogValue };

export type LogFields = Readonly<Record<string, LogValue>>;

export type Logger = Readonly<{
  child: (fields: LogFields) => Logger;
  debug: (message: string, fields?: LogFields) => void;
  info: (message: string, fields?: LogFields) => void;
  warn: (message: string, fields?: LogFields) => void;
  error: (message: string, fields?: LogFields) => void;
  fatal: (message: string, fields?: LogFields) => void;
}>;
