import type { IdentityModule } from '@pressly/identity';
import { result } from '@pressly/kernel';
import type { Router, RequestHandler } from 'express';

export type ProcessorAuthApplication = IdentityModule['application'];
type ResultValue<T> = T extends { tag: 'ok'; value: infer Value }
  ? Value
  : never;

export type LoadedProcessorSession = ResultValue<
  Awaited<ReturnType<ProcessorAuthApplication['loadSession']>>
>;

export const isResultError = result.isErr;

export type ProcessorSessionOptions = Readonly<{
  origin: string;
  csrfSecret: string;
  secureCookies: boolean;
}>;

export type ProcessorBrowserBoundary = Readonly<{
  routes: Router;
  authenticate: RequestHandler;
}>;
