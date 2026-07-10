import type { Logger } from '@pressly/logging';
import type { AnalyticsTracker, ErrorReporter } from '@pressly/metrics';
import type { RequestClient } from '../requests/request-client';
import type { Clock } from './clock';
import type { ContextProvider, WebContext } from './context';

export type WebCorePorts = Readonly<{
  clock: Clock;
  context: ContextProvider<WebContext>;
  logger: Logger;
  analytics: AnalyticsTracker;
  errors: ErrorReporter;
  request: RequestClient;
}>;
