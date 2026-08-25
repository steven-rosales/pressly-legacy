export type CounterName = string;

export type CounterLabels = Readonly<Record<string, string>>;

/** Business metric-name unions are supplied by the generated deployment catalog. */
export type CounterSink<Name extends string = CounterName> = Readonly<{
  increment: (name: Name, labels?: CounterLabels) => void;
}>;

export const nullCounterSink: CounterSink = {
  increment: () => undefined,
};
