import type { Logger } from '@pressly/logging';
import type { AnalyticsTracker, ErrorReporter } from '@pressly/metrics';
import type { FeedbackPort } from '../feedback/feedback';
import type { RequestClient } from '../requests/request-client';
import type { Clock } from './clock';
import type { ContextProvider, WebContext } from './context';

export type WebCore = Readonly<{
  clock: Clock;
  context: ContextProvider<WebContext>;
  logger: Logger;
  analytics: AnalyticsTracker;
  errors: ErrorReporter;
  feedback: FeedbackPort;
  request: RequestClient;
}>;

export const createWebCore = (core: WebCore): WebCore => Object.freeze(core);
