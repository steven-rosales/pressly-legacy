export { defineEvent } from './product-event.js';
export {
  decideObservation,
  shouldReportObservation,
} from './observability-policy.js';

export { nullAnalyticsTracker } from './analytics.js';

export { nullErrorReporter } from './error-reporter.js';
export { nullCounterSink } from './counter.js';

export type {
  EventPrimitive,
  EventProperties,
  EventValue,
  ProductEvent,
} from './product-event.js';

export type { AnalyticsContext, AnalyticsTracker } from './analytics.js';

export type { ErrorReportContext, ErrorReporter } from './error-reporter.js';
export type { CounterLabels, CounterName, CounterSink } from './counter.js';

export type {
  ErrorObservation,
  Observation,
  ObservationCriticality,
  ObservationDecision,
  ObservationDecisionReason,
  ObservationErrorShape,
  ObservationLogLevel,
  ObservationRail,
  ObservationSource,
  RuntimeFailureObservation,
  SecurityObservation,
} from './observability-policy.js';
