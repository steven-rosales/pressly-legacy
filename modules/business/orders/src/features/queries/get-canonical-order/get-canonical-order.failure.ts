export type GetCanonicalOrderFailure =
  | Readonly<{
      kind: 'validation';
      code: 'order_get_invalid';
      message: string;
    }>
  | Readonly<{
      kind: 'not_found';
      code: 'order_not_found';
      message: string;
    }>;

export const getCanonicalOrderFailure = Object.freeze({
  invalidQuery: (): GetCanonicalOrderFailure => ({
    kind: 'validation',
    code: 'order_get_invalid',
    message: 'The Order query is invalid.',
  }),
  notFound: (): GetCanonicalOrderFailure => ({
    kind: 'not_found',
    code: 'order_not_found',
    message: 'The Order was not found.',
  }),
});
