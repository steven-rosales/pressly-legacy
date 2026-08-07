export type ErrorReportContext = Readonly<{
  source: 'web' | 'api' | 'worker';
  operation?: string | undefined;
  requestId?: string | undefined;
  traceId?: string | undefined;
  actorId?: string | undefined;
  route?: string | undefined;
  tags?: Readonly<Record<string, string>> | undefined;
  extra?: Readonly<Record<string, unknown>> | undefined;
}>;

export type ErrorReporter = Readonly<{
  capture: (error: unknown, context: ErrorReportContext) => void;
  shutdown: () => Promise<void>;
}>;

export const nullErrorReporter: ErrorReporter = {
  capture: () => undefined,
  shutdown: async () => undefined,
};
