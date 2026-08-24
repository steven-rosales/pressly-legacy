export type LoadSessionFailure = Readonly<{
  kind: 'authentication';
  code: 'invalid_session' | 'session_expired';
  message: string;
}>;

export const loadSessionFailure = Object.freeze({
  invalid: (): LoadSessionFailure => ({
    kind: 'authentication',
    code: 'invalid_session',
    message: 'Authentication is required.',
  }),
  expired: (): LoadSessionFailure => ({
    kind: 'authentication',
    code: 'session_expired',
    message: 'Please log in again.',
  }),
});
