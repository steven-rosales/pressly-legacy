export type ReadOrdersFailure =
  | Readonly<{
      kind: 'validation';
      code: 'order_list_invalid' | 'order_cursor_invalid' | 'order_get_invalid';
      message: string;
    }>
  | Readonly<{
      kind: 'not_found';
      code: 'order_not_found';
      message: string;
    }>;

export const readOrdersFailure = Object.freeze({
  invalidList: (): ReadOrdersFailure => ({
    kind: 'validation',
    code: 'order_list_invalid',
    message: 'The Order query is invalid.',
  }),
  invalidCursor: (): ReadOrdersFailure => ({
    kind: 'validation',
    code: 'order_cursor_invalid',
    message: 'The Order page cursor is invalid.',
  }),
  invalidGet: (): ReadOrdersFailure => ({
    kind: 'validation',
    code: 'order_get_invalid',
    message: 'The Order query is invalid.',
  }),
  notFound: (): ReadOrdersFailure => ({
    kind: 'not_found',
    code: 'order_not_found',
    message: 'The Order was not found.',
  }),
});
