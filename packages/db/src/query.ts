import { sql as drizzleSql, type SQL } from 'drizzle-orm';

export { and, desc, eq, gt, isNull, lt, lte, ne, or } from 'drizzle-orm';

/**
 * Builds SQL fragments while binding every interpolated value as a parameter.
 * Raw SQL and dynamic identifier helpers are intentionally not exposed.
 */
export const sql = <T = unknown>(
  strings: TemplateStringsArray,
  ...params: unknown[]
): SQL<T> => drizzleSql<T>(strings, ...params);
