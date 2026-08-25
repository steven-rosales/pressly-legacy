import type { HttpSurfaceManifest } from '@pressly/cells';

export type SelectedClientHttpSurface = Readonly<{
  key: string;
  surface: HttpSurfaceManifest;
}>;

export type ClientHttpSurfaceSelection =
  | Readonly<{
      kind: 'selected';
      surfaces: readonly SelectedClientHttpSurface[];
    }>
  | Readonly<{
      kind: 'ambiguous';
      reason: string;
    }>;

const sortedSurfaces = (
  surfaces: readonly HttpSurfaceManifest[],
): readonly HttpSurfaceManifest[] =>
  Object.freeze(
    [...surfaces].sort((left, right) => {
      const leftKey = `${left.method} ${left.path}`;
      const rightKey = `${right.method} ${right.path}`;
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    }),
  );

const terminalLiteral = (path: string): string | null => {
  const segment = path.split('/').filter(Boolean).at(-1);
  return segment === undefined ||
    segment.startsWith(':') ||
    segment.startsWith('*')
    ? null
    : segment;
};

/**
 * A generated client may select one surface by a unique trailing literal.
 * Single-surface operations need no selector and use the neutral `request` key.
 */
export const selectClientHttpSurfaces = (
  surfaces: readonly HttpSurfaceManifest[],
): ClientHttpSurfaceSelection => {
  const ordered = sortedSurfaces(surfaces);
  if (ordered.length === 0)
    return Object.freeze({ kind: 'selected', surfaces: Object.freeze([]) });

  if (ordered.length === 1) {
    const surface = ordered[0];
    if (surface === undefined)
      return Object.freeze({ kind: 'selected', surfaces: Object.freeze([]) });
    return Object.freeze({
      kind: 'selected',
      surfaces: Object.freeze([
        Object.freeze({
          key: terminalLiteral(surface.path) ?? 'request',
          surface,
        }),
      ]),
    });
  }

  const selected = ordered.flatMap((surface) => {
    const key = terminalLiteral(surface.path);
    return key === null ? [] : [Object.freeze({ key, surface })];
  });
  if (selected.length !== ordered.length)
    return Object.freeze({
      kind: 'ambiguous',
      reason:
        'Multiple client HTTP surfaces require a distinct trailing literal on every route.',
    });

  const duplicateKeys = new Set<string>();
  const seen = new Set<string>();
  for (const { key } of selected) {
    if (seen.has(key)) duplicateKeys.add(key);
    else seen.add(key);
  }
  if (duplicateKeys.size > 0)
    return Object.freeze({
      kind: 'ambiguous',
      reason: `Multiple client HTTP surfaces resolve to the same selector: ${[
        ...duplicateKeys,
      ]
        .sort()
        .join(', ')}.`,
    });

  return Object.freeze({
    kind: 'selected',
    surfaces: Object.freeze(selected),
  });
};
