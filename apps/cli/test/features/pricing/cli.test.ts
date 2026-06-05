import { describe, expect, it } from 'vitest';
import { ok } from '@pressly/errors';
import {
  makePricingCli,
  type PricingClient,
  type PricingCliDeps,
} from '../../../src/features/pricing/index.ts';
import { parsePricingCliCommand } from '../../../src/features/pricing/args.ts';
import type { CliIO } from '../../../src/shell/io.ts';
import { runCli } from '../../../src/shell/run-cli.ts';
import { makeTestIo } from '../../support/io.ts';

const makeFakeClient = () => {
  const calls = {
    load: 0,
    plan: 0,
    publish: 0,
    close: 0,
  };

  const client: PricingClient = {
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

    expect(result.ok).toBe(true);

    if (result.ok && result.value !== 'help') {
      expect(result.value.action).toBe('show');
      expect(result.value.serviceSlug).toBe('wash-fold');
      expect(result.value.locationSlug).toBe('hoboken');
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

    expect(result.ok).toBe(true);

    if (result.ok && result.value !== 'help') {
      expect(result.value.action).toBe('plan');
      expect(result.value.items).toHaveLength(2);
      expect(result.value.items[0]).toEqual({
        code: 'delivery_fee',
        priceCents: 495,
      });
      expect(result.value.items[1]).toEqual({
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

    expect(result.ok).toBe(true);

    if (result.ok && result.value !== 'help') {
      expect(result.value.items[0]).toEqual({
        code: 'delivery_fee',
        priceCents: 495,
      });
      expect(result.value.items[1]).toEqual({
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

    expect(result.ok).toBe(true);

    if (result.ok && result.value !== 'help') {
      expect(result.value.action).toBe('publish');
      expect(result.value.confirm).toBe(false);
    }
  });

  it('runs pricing show through the injected pricing client', async () => {
    const fake = makeFakeClient();
    const io = makeTestIo();
    const exitCode = await runTestPricingCli(
      ['pricing', 'show', '--service', 'wash-fold'],
      io,
      { makePricingClient: () => ok(fake.client) },
    );

    expect(exitCode).toBe(0);
    expect(fake.calls.load).toBe(1);
    expect(fake.calls.close).toBe(1);
    expect(io.stdout.text()).toMatch(/Delivery Fee/);
  });

  it('prints pricing plans as JSON for script usage', async () => {
    const fake = makeFakeClient();
    const io = makeTestIo();
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
      { makePricingClient: () => ok(fake.client) },
    );

    expect(exitCode).toBe(0);
    expect(fake.calls.plan).toBe(1);
    expect(fake.calls.close).toBe(1);
    expect(JSON.parse(io.stdout.text())).toEqual({
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
    const io = makeTestIo();
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
      { makePricingClient: () => ok(fake.client) },
    );

    expect(exitCode).toBe(1);
    expect(fake.calls.publish).toBe(0);
    expect(fake.calls.close).toBe(1);
    expect(io.stderr.text()).toMatch(/requires --yes/);
  });
});
