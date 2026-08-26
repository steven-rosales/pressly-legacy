import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { productionSchedulingInventory } from '../src/public.ts';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));

const readRepositoryFile = (path: string): string =>
  readFileSync(new URL(path, `file://${repositoryRoot}/`), 'utf8');

const normalizeWhitespace = (value: string): string =>
  value.replaceAll(/\s+/g, ' ').trim();

const expectedOperationIds = [
  'production.publish-scheduler-config.v1',
  'production.create-shift.v1',
  'production.update-shift.v1',
  'production.replace-shift-selection.v1',
  'production.create-schedule.v1',
  'production.load-schedule.v1',
  'production.accept-schedule.v1',
  'production.start-schedule.v1',
  'production.attempt-automatic-placement.v1',
  'production.place-order-automatically.v1',
  'production.place-order-exactly.v1',
  'production.confirm-order-overtime.v1',
] as const;

describe('production scheduling conformance inventory', () => {
  it('enumerates every current scheduling operation and exact HTTP route', () => {
    expect(productionSchedulingInventory).toHaveLength(12);
    expect(
      productionSchedulingInventory.map(({ operationId }) => operationId),
    ).toEqual(expectedOperationIds);
    expect(
      new Set(
        productionSchedulingInventory.map(({ operationId }) => operationId),
      ).size,
    ).toBe(productionSchedulingInventory.length);

    const httpOperations = productionSchedulingInventory.filter(
      (entry) => entry.http !== null,
    );
    expect(httpOperations).toHaveLength(11);
    expect(
      new Set(
        httpOperations.map(
          (entry) => `${entry.http?.method ?? ''} ${entry.http?.path ?? ''}`,
        ),
      ).size,
    ).toBe(httpOperations.length);
    expect(
      productionSchedulingInventory
        .filter((entry) => entry.runtime === 'composition')
        .map(({ kind, operationId }) => ({ kind, operationId })),
    ).toEqual([
      {
        kind: 'command',
        operationId: 'production.attempt-automatic-placement.v1',
      },
    ]);
    expect(
      productionSchedulingInventory.find(
        ({ operationId }) =>
          operationId === 'production.attempt-automatic-placement.v1',
      )?.idempotency,
    ).toMatchObject({
      required: true,
      replayChecks: [],
      receipt: 'work_event',
      branchSemantics: expect.arrayContaining([
        expect.stringContaining('without a replay precheck'),
        expect.stringContaining('before-lock and after-lock'),
      ]),
    });
  });

  it('records transport ownership, authentication order, and mutation semantics', () => {
    for (const entry of productionSchedulingInventory) {
      expect(entry.contracts.length, entry.operationId).toBeGreaterThan(0);
      expect(
        entry.repositoryCapabilities.length,
        entry.operationId,
      ).toBeGreaterThan(0);
      expect(entry.sqlSemantics.length, entry.operationId).toBeGreaterThan(0);
      expect(entry.cursor, entry.operationId).toBe('none');

      if (entry.http === null) {
        expect(entry.processorOwnership).toEqual({
          httpOwner: 'none',
          consumer: 'production-composition',
          client: 'none',
          consumerAnchor: null,
        });
        continue;
      }

      expect(entry.processorOwnership).toMatchObject({
        httpOwner: 'production-system',
        consumer: 'processor',
        consumerAnchor: { file: expect.any(String) },
      });
      expect(entry.processorOwnership.client).toBe('handwritten');
      expect(entry.http.authentication).toBe('required');
      expect(entry.http.boundaryOrder.at(0)).toBe('authentication');
      expect(entry.http.boundaryOrder.at(-1)).toBe('authorization');
      if (entry.http.requestContract !== null)
        expect(entry.http.boundaryOrder).toEqual([
          'authentication',
          'body',
          'params',
          'authorization',
        ]);
    }
  });

  it('anchors every Production capability to Access policy and the API adapter', () => {
    const policy = normalizeWhitespace(
      readRepositoryFile(
        'systems/access/src/model/authorization/operations/authorize-production/production-authorization.policy.ts',
      ),
    );
    for (const capability of [
      "'production:read'",
      "'production:schedule'",
      "'production:accept'",
      "'production:start'",
      "'production:override'",
    ])
      expect(policy).toContain(capability);

    const adapter = normalizeWhitespace(
      readRepositoryFile(
        'topology/runtime/http/bootstrap/http-boundary-providers.ts',
      ),
    );
    expect(adapter).toContain(
      normalizeWhitespace("input.capability.startsWith('production:')"),
    );
    expect(adapter).toContain(
      normalizeWhitespace('action: input.capability as Action'),
    );
  });

  it('selects create-shift as the smallest representative scheduling command', () => {
    const commands = productionSchedulingInventory.filter(
      (entry) => entry.kind === 'command',
    );
    const minimumCommandScore = Math.min(
      ...commands.map((entry) => entry.complexity.score),
    );
    const representative = productionSchedulingInventory.find(
      ({ operationId }) => operationId === 'production.create-shift.v1',
    );

    expect(representative).toMatchObject({
      kind: 'command',
      transaction: 'required',
      locks: [],
      idempotency: {
        required: true,
        replayChecks: ['before_lock'],
        receipt: 'work_event',
      },
      complexity: { score: minimumCommandScore },
    });
    expect(representative?.workEvents).toEqual(['production_shift_created']);
  });

  it('keeps every inventory claim anchored in its current authority', () => {
    for (const entry of productionSchedulingInventory) {
      expect(entry.evidence.length, entry.operationId).toBeGreaterThan(0);
      expect(entry.sourceAnchors.length, entry.operationId).toBeGreaterThan(0);
      for (const evidence of entry.evidence)
        expect(
          () => readRepositoryFile(evidence),
          `${entry.operationId}: ${evidence}`,
        ).not.toThrow();

      for (const anchor of entry.sourceAnchors) {
        const source = normalizeWhitespace(readRepositoryFile(anchor.file));
        for (const snippet of anchor.contains)
          expect(source, `${entry.operationId}: ${anchor.file}`).toContain(
            normalizeWhitespace(snippet),
          );
      }

      const consumerAnchor = entry.processorOwnership.consumerAnchor;
      if (consumerAnchor !== null) {
        const source = normalizeWhitespace(
          readRepositoryFile(consumerAnchor.file),
        );
        for (const snippet of consumerAnchor.contains)
          expect(
            source,
            `${entry.operationId}: ${consumerAnchor.file}`,
          ).toContain(normalizeWhitespace(snippet));
      }
    }
  });
});
