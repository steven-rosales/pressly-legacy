import { describe, expect, it } from 'vitest';
import { webhookEventReadyV1MessageContract } from '../../../contracts/webhook-event-ready-v1.ts';
import { ingestEventCellDeclaration } from './cell.ts';

describe('ingest-event message ownership', () => {
  it('emits the exact producer-owned ready-event contract object', () => {
    expect(ingestEventCellDeclaration.emits).toHaveLength(1);
    expect(ingestEventCellDeclaration.emits[0]).toBe(
      webhookEventReadyV1MessageContract,
    );
  });
});
