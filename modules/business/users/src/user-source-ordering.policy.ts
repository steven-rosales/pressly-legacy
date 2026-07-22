import { result, type Result } from '@pressly/kernel';
import type { SourceRevision } from './users.port.ts';

export type SourceRevisionDecision = 'apply' | 'replay' | 'stale' | 'conflict';

export const decideSourceRevision = (
  current: Pick<SourceRevision, 'at' | 'hash'> | null,
  incoming: Pick<SourceRevision, 'at' | 'hash'>,
): Result<Exclude<SourceRevisionDecision, 'conflict'>, 'conflict'> => {
  if (current === null) return result.ok('apply');

  const ordering = incoming.at.getTime() - current.at.getTime();
  if (ordering < 0) return result.ok('stale');
  if (ordering > 0) return result.ok('apply');
  if (incoming.hash === current.hash) return result.ok('replay');
  return result.err('conflict');
};

export const maySourceWriteField = (
  authority: Readonly<{
    authority: string;
    source: string | null;
  }> | null,
  source: string,
): boolean =>
  authority === null ||
  (authority.authority === 'source' && authority.source === source);
