import type { ProductEvent } from './product-event.js';

export type AnalyticsContext = Readonly<{
  distinctId?: string;
  sessionId: string;
  requestId?: string;
  traceId?: string;
  route?: string;
}>;

export type AnalyticsTracker = Readonly<{
  track: (event: ProductEvent, context?: AnalyticsContext) => void;
  identify: (
    distinctId: string,
    properties?: Readonly<Record<string, string | number | boolean>>,
  ) => void;
  shutdown: () => Promise<void>;
}>;

export const nullAnalyticsTracker: AnalyticsTracker = {
  track: () => undefined,
  identify: () => undefined,
  shutdown: async () => undefined,
};
