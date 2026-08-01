import type { AuthModule } from '@pressly/auth-module';
import type {
  PresslyApplication,
  ProcessorCapability,
} from '@pressly/contracts';
import type { Router, RequestHandler } from 'express';

export type ProcessorAuthApplication = AuthModule['application'];
type ResultValue<T> = T extends { tag: 'ok'; value: infer Value }
  ? Value
  : never;

export type LoadedProcessorSession = ResultValue<
  Awaited<ReturnType<ProcessorAuthApplication['loadSession']>>
>;

export type ResultLike<Value, Error> =
  | Readonly<{ tag: 'ok'; value: Value }>
  | Readonly<{ tag: 'err'; error: Error }>;

export const isResultError = <Value, Error>(
  value: ResultLike<Value, Error>,
): value is Readonly<{ tag: 'err'; error: Error }> => value.tag === 'err';

export type ProcessorAccess = Readonly<{
  locations: readonly Readonly<{
    id: string;
    name: string;
    timezone: string;
    capabilities: readonly ProcessorCapability[];
  }>[];
  applications: readonly PresslyApplication[];
}>;

export type ResolveProcessorAccess = (
  session: LoadedProcessorSession,
) => Promise<ProcessorAccess | null>;

export type ProcessorSessionOptions = Readonly<{
  origin: string;
  csrfSecret: string;
  secureCookies: boolean;
}>;

export type ProcessorBrowserBoundary = Readonly<{
  routes: Router;
  authenticate: RequestHandler;
}>;
