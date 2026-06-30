export type CounterName =
  | 'security.login_failures'
  | 'security.authorization_denials'
  | 'security.rate_limits'
  | 'api.server_errors';

export type CounterLabels = Readonly<Record<string, string>>;

export type CounterSink = Readonly<{
  increment: (name: CounterName, labels?: CounterLabels) => void;
}>;

export const nullCounterSink: CounterSink = {
  increment: () => undefined,
};
