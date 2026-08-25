import type { Logger } from '@pressly/logging';
import type { AnalyticsTracker, ErrorReporter } from '@pressly/observability';
import type { Clock } from '@pressly/time';
import type { RequestClient } from '../../transport/model/request-client';
import type { ContextProvider, WebContext } from './context';

export type WebCorePorts = Readonly<{
  clock: Clock;
  context: ContextProvider<WebContext>;
  logger: Logger;
  analytics: AnalyticsTracker;
  errors: ErrorReporter;
  request: RequestClient;
  refreshPricing: () => Promise<void>;
}>;
