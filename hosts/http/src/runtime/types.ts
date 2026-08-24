import type { Logger, SecurityEventSink } from '@pressly/logging';
import type {
  CounterSink,
  ErrorReporter,
  MeasurementSink,
  TraceSink,
} from '@pressly/observability';

export type HttpBoundaryRuntime = Readonly<{
  logger: Logger;
  securityEvents: SecurityEventSink;
  observability: Readonly<{
    errors: ErrorReporter;
    counters: CounterSink;
    measurements?: MeasurementSink;
    trace?: TraceSink;
  }>;
}>;
