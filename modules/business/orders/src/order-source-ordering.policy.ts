import { result, type Result } from '@pressly/kernel';
import type { OrderSourceRevision } from './orders.port.ts';

export const decideOrderSourceRevision = (
  current: Pick<OrderSourceRevision, 'at' | 'hash'> | null,
  incoming: Pick<OrderSourceRevision, 'at' | 'hash'>,
): Result<'apply' | 'replay' | 'stale', 'conflict'> => {
  if (current === null) return result.ok('apply');
  const ordering = incoming.at.getTime() - current.at.getTime();
  if (ordering < 0) return result.ok('stale');
  if (ordering > 0) return result.ok('apply');
  return incoming.hash === current.hash
    ? result.ok('replay')
    : result.err('conflict');
};

export const mayOrderSourceWriteField = (
  authority: Readonly<{ authority: string; source: string | null }> | null,
  source: string,
): boolean =>
  authority === null ||
  (authority.authority === 'source' && authority.source === source);
