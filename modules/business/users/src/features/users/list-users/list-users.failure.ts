export type ListUsersFailure = Readonly<{
  kind: 'validation';
  code: 'user_list_invalid' | 'user_cursor_invalid';
}>;

export const listUsersFailure = Object.freeze({
  invalidQuery: (): ListUsersFailure => ({
    kind: 'validation',
    code: 'user_list_invalid',
  }),
  invalidCursor: (): ListUsersFailure => ({
    kind: 'validation',
    code: 'user_cursor_invalid',
  }),
});
