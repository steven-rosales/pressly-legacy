export type GetUserFailure =
  | Readonly<{ kind: 'validation'; code: 'user_get_invalid' }>
  | Readonly<{ kind: 'not_found'; code: 'user_not_found' }>;

export const getUserFailure = Object.freeze({
  invalidQuery: (): GetUserFailure => ({
    kind: 'validation',
    code: 'user_get_invalid',
  }),
  notFound: (): GetUserFailure => ({
    kind: 'not_found',
    code: 'user_not_found',
  }),
});
