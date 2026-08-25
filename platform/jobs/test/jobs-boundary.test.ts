import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const sources = await Promise.all(
  [
    'delivery.ts',
    'execution.ts',
    'observation.ts',
    'poll-loop.ts',
    'public.ts',
    'queue-job.ts',
    'retry.ts',
    'sequential.ts',
    'shutdown.ts',
  ].map((name) => readFile(new URL(`../src/${name}`, import.meta.url), 'utf8')),
);

describe('durable jobs platform boundary', () => {
  it('contains no Pressly business import, queue identity, or operation switch', () => {
    const source = sources.join('\n');
    const imports = [...source.matchAll(/from ['"]([^'"]+)['"]/g)].map(
      (match) => match[1],
    );

    expect(imports).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /^@pressly\/(?:contracts|db|orders|pricing|production|users|webhook-ingestion)(?:\/|$)/,
        ),
      ]),
    );
    expect(source).not.toMatch(
      /\b(?:cents|customer|laundry|order_outbox|production|webhook_ingestion)\b/i,
    );
    expect(source).not.toMatch(/switch\s*\(\s*(?:job|operation)(?:Id)?\s*\)/i);
    expect(source).not.toMatch(/renew(?:al|Lease)|heartbeat.*lease/i);
  });
});
