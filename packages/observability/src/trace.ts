import { attemptObservation } from './observation-effect.js';

export type TraceSpanStatus = 'ok' | 'error';

export type TraceSpanAttributeValue = string | number | boolean;

export type TraceSpanAttributes = Readonly<
  Record<string, TraceSpanAttributeValue>
>;

export type TraceSpanDefinition = Readonly<{
  name: string;
  operation: string;
  attributes?: TraceSpanAttributes | undefined;
}>;

export type TraceSpan = Readonly<{
  setAttribute: (name: string, value: TraceSpanAttributeValue) => void;
  setStatus: (status: TraceSpanStatus) => void;
}>;

export type TraceSink = Readonly<{
  startActiveSpan: <Value>(
    definition: TraceSpanDefinition,
    work: (span: TraceSpan) => Promise<Value>,
  ) => Promise<Value>;
}>;

const nullTraceSpan: TraceSpan = Object.freeze({
  setAttribute: () => undefined,
  setStatus: () => undefined,
});

export const nullTraceSink: TraceSink = Object.freeze({
  startActiveSpan: (_definition, work) => work(nullTraceSpan),
});

const isolateTraceSpan = (span: TraceSpan): TraceSpan =>
  Object.freeze({
    setAttribute: (name, value) => {
      attemptObservation(() => span.setAttribute(name, value));
    },
    setStatus: (status) => {
      attemptObservation(() => span.setStatus(status));
    },
  });

/**
 * Prevents a tracing implementation from replacing the result of the work it
 * observes. The callback executes at most once. If tracing fails before
 * invoking it, work proceeds against a null span; if tracing fails after
 * invoking it, the callback's exact result or rejection remains authoritative.
 */
export const isolateTraceSink = (sink: TraceSink): TraceSink =>
  Object.freeze({
    startActiveSpan: async <Value>(
      definition: TraceSpanDefinition,
      work: (span: TraceSpan) => Promise<Value>,
    ): Promise<Value> => {
      let execution: Promise<Value> | undefined;

      const executeOnce = (span: TraceSpan): Promise<Value> => {
        execution ??= (async () => work(isolateTraceSpan(span)))();
        return execution;
      };

      try {
        await sink.startActiveSpan(definition, executeOnce);
      } catch {
        // The callback promise below remains the authoritative outcome.
      }

      return execution ?? executeOnce(nullTraceSpan);
    },
  });
