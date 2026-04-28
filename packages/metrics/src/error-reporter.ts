export type ErrorReportContext = Readonly<{
  source: 'web' | 'api' | 'worker';
  operation?: string;
  requestId?: string;
  traceId?: string;
  actorId?: string;
  route?: string;
  tags?: Readonly<Record<string, string>>;
  extra?: Readonly<Record<string, unknown>>;
}>;

export type ErrorReporter = Readonly<{
  capture: (error: unknown, context: ErrorReportContext) => void;
  shutdown: () => Promise<void>;
}>;

export const nullErrorReporter: ErrorReporter = {
  capture: () => undefined,
  shutdown: async () => undefined,
};
