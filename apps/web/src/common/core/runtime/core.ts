import type { Logger } from '@pressly/logging';
import type { AnalyticsTracker, ErrorReporter } from '@pressly/metrics';
import {
  createCommandRuntime,
  type CommandRuntime,
} from '../actions/command';
import { createQueryRuntime, type QueryRuntime } from '../actions/query';
import type { FeedbackPort } from '../feedback/feedback';
import type { RequestClient } from '../requests/request-client';
import type { Clock } from './clock';
import type { ContextProvider, WebContext } from './context';

export type WebCorePorts = Readonly<{
  clock: Clock;
  context: ContextProvider<WebContext>;
  logger: Logger;
  analytics: AnalyticsTracker;
  errors: ErrorReporter;
  feedback: FeedbackPort;
  request: RequestClient;
}>;

export type WebCore = WebCorePorts &
  Readonly<{
    command: CommandRuntime;
    query: QueryRuntime;
  }>;

export const createWebCore = (ports: WebCorePorts): WebCore =>
  Object.freeze({
    ...ports,
    command: createCommandRuntime(ports),
    query: createQueryRuntime(ports),
  });
