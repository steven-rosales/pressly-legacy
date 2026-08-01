import type { AppError } from '@pressly/errors';
import { result, type Result } from '@pressly/kernel';
import { invalidWorkforceInput } from './workforce-validation.policy.ts';

export type WorkforceCursor = Readonly<{ createdAt: Date; id: string }>;

export const encodeWorkforceCursor = (cursor: WorkforceCursor): string =>
  Buffer.from(
    JSON.stringify({
      createdAt: cursor.createdAt.toISOString(),
      id: cursor.id,
    }),
  ).toString('base64url');

export const decodeWorkforceCursor = (
  cursor: string,
): Result<WorkforceCursor, AppError> => {
  try {
    const decoded = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as unknown;
    if (
      typeof decoded !== 'object' ||
      decoded === null ||
      !('createdAt' in decoded) ||
      typeof decoded.createdAt !== 'string' ||
      !('id' in decoded) ||
      typeof decoded.id !== 'string' ||
      decoded.id.trim().length === 0
    )
      return result.err(invalidWorkforceInput('cursor'));
    const createdAt = new Date(decoded.createdAt);
    if (Number.isNaN(createdAt.getTime()))
      return result.err(invalidWorkforceInput('cursor'));

    return result.ok({ createdAt, id: decoded.id });
  } catch {
    return result.err(invalidWorkforceInput('cursor'));
  }
};
