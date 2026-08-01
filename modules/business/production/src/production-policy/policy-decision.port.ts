export type PolicyDecision<T> =
  | Readonly<{ tag: 'ok'; value: T }>
  | Readonly<{
      tag: 'err';
      error: Readonly<{ code: string; message: string }>;
    }>;
