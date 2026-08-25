import { isAppError } from '@pressly/errors/app-error';
import { sql } from '@pressly/postgres/query';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import {
  loadPricingDurableState,
  makePricingPostgresSystem,
  pricingCommitInput,
  pricingPostgresDatabase,
  pricingPostgresSchema,
  pricingPublishCommand,
  pricingPublishedAt,
  registerPricingPostgresLifecycle,
  seedPricing,
} from '../../../testing/pricing-postgres.fixture.ts';
import { makePostgresPricingChangePublisher } from './postgres.ts';
import { publishPricingChangeCellDeclaration } from './cell.ts';

registerPricingPostgresLifecycle();

proveOperation({
  operationId: 'pricing.publish-pricing-change.v1',
  declaration: publishPricingChangeCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'commit_success',
      proves: ['postgres-commit'],
      run: async () => {
        const { set } = await seedPricing();
        const outcome =
          await makePricingPostgresSystem().cells.publishPricingChange.execute(
            pricingPublishCommand,
          );

        expect(outcome).toMatchObject({
          kind: 'success',
          value: { oldPricingSetId: set.id, changeItemCount: 1 },
        });
        if (outcome.kind === 'failure') return;

        const state = await loadPricingDurableState();
        expect(state.sets).toHaveLength(2);
        expect(state.sets.map((row) => row.status).sort()).toEqual([
          'active',
          'archived',
        ]);
        expect(
          state.items
            .filter((row) => row.pricingSetId === outcome.value.newPricingSetId)
            .map((row) => ({ code: row.code, priceCents: row.priceCents })),
        ).toEqual([
          { code: 'delivery_fee', priceCents: 100 },
          { code: 'hang_dry', priceCents: 295 },
        ]);
        expect(state.events).toMatchObject([
          {
            id: outcome.value.auditEventId,
            kind: 'pricing.publish',
            actorId: 'user_1',
            actorKind: 'human',
            actorDisplayName: 'steven',
            serviceSlug: 'wash-fold',
            reason: 'Update delivery fee',
            oldPricingSetId: set.id,
            newPricingSetId: outcome.value.newPricingSetId,
            input: pricingPublishCommand,
            createdAt: pricingPublishedAt,
          },
        ]);
      },
    },

    {
      name: 'optimistic_concurrency_fence',
      proves: ['declared-concurrency-race'],
      run: async () => {
        const { set } = await seedPricing();
        const publish = makePostgresPricingChangePublisher(
          pricingPostgresDatabase.db,
          pricingPostgresSchema,
        );

        const outcomes = await Promise.all([
          publish(pricingCommitInput(set.id)),
          publish(pricingCommitInput(set.id)),
        ]);
        expect(outcomes.filter((outcome) => outcome.tag === 'ok')).toHaveLength(
          1,
        );
        expect(
          outcomes.filter((outcome) => outcome.tag === 'err'),
        ).toMatchObject([
          {
            tag: 'err',
            error: {
              code: 'pricing_state_changed',
              expectedPricingSetId: set.id,
            },
          },
        ]);
        const state = await loadPricingDurableState();
        expect(state.sets).toHaveLength(2);
        expect(state.events).toHaveLength(1);
      },
    },

    {
      name: 'expected_replay_rejection',
      proves: ['expected-rejection-no-partial-write'],
      run: async () => {
        await seedPricing();
        const execute =
          makePricingPostgresSystem().cells.publishPricingChange.execute;

        expect((await execute(pricingPublishCommand)).kind).toBe('success');
        await expect(execute(pricingPublishCommand)).resolves.toMatchObject({
          kind: 'failure',
          failure: { code: 'pricing_change_has_no_changes' },
        });
        const state = await loadPricingDurableState();
        expect(state.sets).toHaveLength(2);
        expect(state.events).toHaveLength(1);
      },
    },

    {
      name: 'unexpected_failure_rollback',
      proves: ['unexpected-failure-rollback'],
      run: async () => {
        const { set } = await seedPricing();
        await pricingPostgresDatabase.db.execute(sql`
      create function pricing_reject_audit_insert()
      returns trigger
      language plpgsql
      as $$
      begin
        raise exception 'pricing audit fault';
      end;
      $$
    `);
        await pricingPostgresDatabase.db.execute(sql`
      create trigger pricing_audit_fault
      before insert on pricing_change_events
      for each row execute function pricing_reject_audit_insert()
    `);

        await expect(
          makePricingPostgresSystem().cells.publishPricingChange.execute(
            pricingPublishCommand,
          ),
        ).rejects.toSatisfy(
          (error: unknown) =>
            isAppError(error) && error.code === 'pricing_publish_failed',
        );
        const state = await loadPricingDurableState();
        expect(state.sets).toMatchObject([
          { id: set.id, status: 'active', effectiveTo: null },
        ]);
        expect(state.items).toHaveLength(2);
        expect(state.events).toEqual([]);
      },
    },
  ],
});
