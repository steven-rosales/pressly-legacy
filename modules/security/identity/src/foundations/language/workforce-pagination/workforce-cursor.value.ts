import { result, type Result } from '@pressly/kernel';
import {
  decodeBase64UrlJson,
  encodeBase64UrlJson,
  isJsonObject,
} from '@pressly/codec';
import { invalidWorkforceInput } from '../workforce-command/workforce-command.policy.ts';
import type { WorkforceFailure } from '../workforce-failure/workforce-failure.failure.ts';

export type WorkforceCursor = Readonly<{ createdAt: Date; id: string }>;

export const encodeWorkforceCursor = (cursor: WorkforceCursor): string =>
  encodeBase64UrlJson({
    createdAt: cursor.createdAt.toISOString(),
    id: cursor.id,
  });

export const decodeWorkforceCursor = (
  cursor: string,
): Result<WorkforceCursor, WorkforceFailure> => {
  const decoded = decodeBase64UrlJson(cursor);
  if (
    !isJsonObject(decoded) ||
    typeof decoded['createdAt'] !== 'string' ||
    typeof decoded['id'] !== 'string' ||
    decoded['id'].trim().length === 0
  )
    return result.err(invalidWorkforceInput('cursor'));
  const createdAt = new Date(decoded['createdAt']);
  if (Number.isNaN(createdAt.getTime()))
    return result.err(invalidWorkforceInput('cursor'));

  return result.ok({ createdAt, id: decoded['id'] });
};
