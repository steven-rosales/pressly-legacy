export type ListCanonicalOrdersFailure = Readonly<{
  kind: 'validation';
  code: 'order_list_invalid' | 'order_cursor_invalid';
  message: string;
}>;

export const listCanonicalOrdersFailure = Object.freeze({
  invalidQuery: (): ListCanonicalOrdersFailure => ({
    kind: 'validation',
    code: 'order_list_invalid',
    message: 'The Order query is invalid.',
  }),
  invalidCursor: (): ListCanonicalOrdersFailure => ({
    kind: 'validation',
    code: 'order_cursor_invalid',
    message: 'The Order page cursor is invalid.',
  }),
});
