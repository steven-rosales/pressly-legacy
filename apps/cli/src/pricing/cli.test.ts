import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ok } from '@pressly/errors';
import { runCli } from '../shell/run-cli.ts';
import type { CliIO } from '../shell/io.ts';
import type { PricingAdminClient } from './client.ts';
import { makePricingCli, type PricingCliDeps } from './cli.ts';
import { parsePricingCliCommand } from './args.ts';

const makeWriter = () => {
  let value = '';

  return {
    write: (chunk: string | Uint8Array) => {
      value += chunk.toString();
      return true;
    },
    text: () => value,
  };
};

const makeFakeClient = () => {
  const calls = {
    load: 0,
    plan: 0,
    publish: 0,
    close: 0,
  };

  const client: PricingAdminClient = {
    loadCatalog: async (command) => {
      calls.load += 1;

      return ok({
        serviceSlug: command.serviceSlug,
        ...(command.locationSlug === undefined
          ? {}
          : { locationSlug: command.locationSlug }),
        currency: 'USD',
        updatedAt: '2026-05-22T00:00:00.000Z',
        items: [
          {
            service: 'wash_fold',
            category: 'Fee',
            name: 'Delivery Fee',
            unit: 'order',
            priceCents: 495,
            sortOrder: 1,
            metadata: {},
          },
        ],
      });
    },
    planChange: async (command) => {
      calls.plan += 1;

      return ok({
        serviceSlug: command.serviceSlug,
        ...(command.locationSlug === undefined
          ? {}
          : { locationSlug: command.locationSlug }),
        reason: command.reason,
        oldPricingSetId: 'old_set',
        currency: 'USD',
        changes: [
          {
            code: command.items[0]?.code ?? 'delivery_fee',
            name: 'Delivery Fee',
            oldPriceCents: 495,
            newPriceCents: command.items[0]?.priceCents ?? 100,
          },
        ],
      });
    },
    publishChange: async () => {
      calls.publish += 1;

      return ok({
        oldPricingSetId: 'old_set',
        newPricingSetId: 'new_set',
        auditEventId: 'event_id',
        changeItemCount: 1,
      });
    },
    close: async () => {
      calls.close += 1;
    },
  };

  return { calls, client };
};

const makeIo = (): CliIO & {
  stdout: ReturnType<typeof makeWriter>;
  stderr: ReturnType<typeof makeWriter>;
} => ({
  stdout: makeWriter(),
  stderr: makeWriter(),
});

const runTestPricingCli = (
  argv: readonly string[],
  io: CliIO,
  deps: PricingCliDeps,
): Promise<number> =>
  runCli({
    argv,
    env: {},
    io,
    features: [makePricingCli(deps)],
  });

describe('pricing CLI', () => {
  it('parses a pricing show command', () => {
    const result = parsePricingCliCommand([
      '--',
      'pricing',
      'show',
      '--service',
      'wash-fold',
      '--location',
      'hoboken',
    ]);

    assert.equal(result.ok, true);

    if (result.ok && result.value !== 'help') {
      assert.equal(result.value.action, 'show');
      assert.equal(result.value.serviceSlug, 'wash-fold');
      assert.equal(result.value.locationSlug, 'hoboken');
    }
  });

  it('parses repeated pricing change items', () => {
    const result = parsePricingCliCommand([
      'pricing',
      'plan',
      '--service',
      'dry-cleaning',
      '--set',
      'delivery_fee=4.95',
      '--set',
      'shirt=2.50',
      '--reason',
      'Update tested CLI pricing',
    ]);

    assert.equal(result.ok, true);

    if (result.ok && result.value !== 'help') {
      assert.equal(result.value.action, 'plan');
      assert.equal(result.value.items.length, 2);
      assert.deepEqual(result.value.items[0], {
        code: 'delivery_fee',
        priceCents: 495,
      });
      assert.deepEqual(result.value.items[1], {
        code: 'shirt',
        priceCents: 250,
      });
    }
  });

  it('parses supported money input syntax from pricing changes', () => {
    const result = parsePricingCliCommand([
      'pricing',
      'plan',
      '--service',
      'wash-fold',
      '--set',
      'delivery_fee=$4.95',
      '--set',
      'shirt=495c',
      '--reason',
      'Update tested CLI pricing',
    ]);

    assert.equal(result.ok, true);

    if (result.ok && result.value !== 'help') {
      assert.deepEqual(result.value.items[0], {
        code: 'delivery_fee',
        priceCents: 495,
      });
      assert.deepEqual(result.value.items[1], {
        code: 'shirt',
        priceCents: 495,
      });
    }
  });

  it('requires explicit confirmation for publish at run time only', () => {
    const result = parsePricingCliCommand([
      'pricing',
      'publish',
      '--service',
      'wash-fold',
      '--set',
      'delivery_fee=4.95',
      '--reason',
      'Update tested CLI pricing',
    ]);

    assert.equal(result.ok, true);

    if (result.ok && result.value !== 'help') {
      assert.equal(result.value.action, 'publish');
      assert.equal(result.value.confirm, false);
    }
  });

  it('runs pricing show through the injected admin client', async () => {
    const fake = makeFakeClient();
    const io = makeIo();
    const exitCode = await runTestPricingCli(
      ['pricing', 'show', '--service', 'wash-fold'],
      io,
      { makePricingAdminClient: () => ok(fake.client) },
    );

    assert.equal(exitCode, 0);
    assert.equal(fake.calls.load, 1);
    assert.equal(fake.calls.close, 1);
    assert.match(io.stdout.text(), /Delivery Fee/);
  });

  it('prints pricing plans as JSON for script usage', async () => {
    const fake = makeFakeClient();
    const io = makeIo();
    const exitCode = await runTestPricingCli(
      [
        'pricing',
        'plan',
        '--service',
        'wash-fold',
        '--set',
        'delivery_fee=1.00',
        '--reason',
        'Test JSON output',
        '--json',
      ],
      io,
      { makePricingAdminClient: () => ok(fake.client) },
    );

    assert.equal(exitCode, 0);
    assert.equal(fake.calls.plan, 1);
    assert.equal(fake.calls.close, 1);
    assert.deepEqual(JSON.parse(io.stdout.text()), {
      serviceSlug: 'wash-fold',
      reason: 'Test JSON output',
      oldPricingSetId: 'old_set',
      currency: 'USD',
      changes: [
        {
          code: 'delivery_fee',
          name: 'Delivery Fee',
          oldPriceCents: 495,
          newPriceCents: 100,
        },
      ],
    });
  });

  it('fails closed when publish runs non-interactively without --yes', async () => {
    const fake = makeFakeClient();
    const io = makeIo();
    const exitCode = await runTestPricingCli(
      [
        'pricing',
        'publish',
        '--service',
        'wash-fold',
        '--set',
        'delivery_fee=1.00',
        '--reason',
        'Test confirmation',
      ],
      io,
      { makePricingAdminClient: () => ok(fake.client) },
    );

    assert.equal(exitCode, 1);
    assert.equal(fake.calls.publish, 0);
    assert.equal(fake.calls.close, 1);
    assert.match(io.stderr.text(), /requires --yes/);
  });
});
