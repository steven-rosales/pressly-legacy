/**
 * Dependency-free throwable construction for repository tooling that must run
 * directly from a checkout, including deployment entrypoints before pnpm has
 * installed workspace links. Native Error construction remains owned here.
 *
 * @param {{
 *   code: string;
 *   message: string;
 *   cause?: unknown;
 *   nativeKind?: 'Error' | 'RangeError' | 'TypeError';
 * }} input
 * @returns {Error & Readonly<{ tag: 'ToolingError'; code: string }>}
 */
export const toolingError = (input) => {
  const ErrorConstructor =
    input.nativeKind === 'TypeError'
      ? TypeError
      : input.nativeKind === 'RangeError'
        ? RangeError
        : Error;
  const error =
    input.cause === undefined
      ? new ErrorConstructor(input.message)
      : new ErrorConstructor(input.message, { cause: input.cause });

  return Object.assign(error, {
    tag: /** @type {const} */ ('ToolingError'),
    code: input.code,
  });
};
