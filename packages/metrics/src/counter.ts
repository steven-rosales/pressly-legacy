export type CounterName =
  | 'security.login_failures'
  | 'security.authorization_denials'
  | 'security.rate_limits'
  | 'security.critical_events'
  | 'api.server_errors'
  | 'web.critical_failures'
  | 'product.critical_failures'
  | 'deployment.failures';

export type CounterLabels = Readonly<Record<string, string>>;

export type CounterSink = Readonly<{
  increment: (name: CounterName, labels?: CounterLabels) => void;
}>;

export const nullCounterSink: CounterSink = {
  increment: () => undefined,
};
