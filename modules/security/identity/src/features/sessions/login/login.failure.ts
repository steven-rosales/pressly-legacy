export type LoginFailure = Readonly<{
  kind: 'authentication' | 'rate_limit';
  code: 'invalid_credentials' | 'login_rate_limited';
  message: string;
}>;

export const loginFailure = Object.freeze({
  invalidCredentials: (): LoginFailure => ({
    kind: 'authentication',
    code: 'invalid_credentials',
    message: 'Invalid email or password.',
  }),
  rateLimited: (): LoginFailure => ({
    kind: 'rate_limit',
    code: 'login_rate_limited',
    message: 'Too many failed login attempts. Try again later.',
  }),
});
