export type ReadUsersFailure =
  | Readonly<{
      kind: 'validation';
      code: 'user_list_invalid' | 'user_get_invalid' | 'user_cursor_invalid';
    }>
  | Readonly<{ kind: 'not_found'; code: 'user_not_found' }>;

export const readUsersFailure = Object.freeze({
  invalidList: (): ReadUsersFailure => ({
    kind: 'validation',
    code: 'user_list_invalid',
  }),
  invalidGet: (): ReadUsersFailure => ({
    kind: 'validation',
    code: 'user_get_invalid',
  }),
  invalidCursor: (): ReadUsersFailure => ({
    kind: 'validation',
    code: 'user_cursor_invalid',
  }),
  notFound: (): ReadUsersFailure => ({
    kind: 'not_found',
    code: 'user_not_found',
  }),
});
