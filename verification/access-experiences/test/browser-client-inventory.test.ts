import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  makeControlAuthenticationBrowserClient,
  makeControlCustomersBrowserClient,
  makeControlInvitationsBrowserClient,
  makeControlOrdersBrowserClient,
  makeControlSecurityBrowserClient,
  makeControlWorkforceBrowserClient,
} from '@pressly/experience-control/browser';
import {
  makeProcessorAuthenticationBrowserClient,
  makeProcessorOrdersBrowserClient,
} from '@pressly/experience-processor/browser';

const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url));

const targetOperationIds = [
  'processor.auth-login.v1',
  'processor.complete-mfa-challenge.v1',
  'processor.load-auth-session.v1',
  'processor.logout.v1',
  'orders.list-incoming-order-proposals.v1',
  'orders.accept-incoming-order-proposal.v1',
  'orders.reject-incoming-order-proposal.v1',
  'orders.restore-incoming-order-proposal.v1',
] as const;

const generatedOperationIds = (source: string): readonly string[] =>
  [...source.matchAll(/operationId: '([^']+)'/gu)].map((match) => match[1]!);

describe('Experience browser-client surfaces', () => {
  it('publishes explicit leaf client factories from both Experience owners', () => {
    expect([
      makeControlAuthenticationBrowserClient,
      makeControlCustomersBrowserClient,
      makeControlInvitationsBrowserClient,
      makeControlOrdersBrowserClient,
      makeControlSecurityBrowserClient,
      makeControlWorkforceBrowserClient,
    ]).toHaveLength(6);
    expect([
      makeProcessorAuthenticationBrowserClient,
      makeProcessorOrdersBrowserClient,
    ]).toHaveLength(2);
  });

  it('generates the exact Customer, Control, and Processor browser inventories', () => {
    const generatedCustomer = readFileSync(
      resolve(repositoryRoot, 'generated/clients/customer.ts'),
      'utf8',
    );
    const generatedControl = readFileSync(
      resolve(repositoryRoot, 'generated/clients/control.ts'),
      'utf8',
    );
    const generatedProcessor = readFileSync(
      resolve(repositoryRoot, 'generated/clients/processor.ts'),
      'utf8',
    );
    expect(
      existsSync(resolve(repositoryRoot, 'generated/clients/control.ts')),
    ).toBe(true);

    const customerOperationIds = generatedOperationIds(generatedCustomer);
    expect(customerOperationIds).toHaveLength(12);
    expect(
      customerOperationIds.filter((id) => id.startsWith('customer.')),
    ).toHaveLength(11);
    expect(
      customerOperationIds.filter((id) => !id.startsWith('customer.')),
    ).toEqual(['pricing.load-pricing-catalog.v1']);

    const controlOperationIds = generatedOperationIds(generatedControl);
    expect(controlOperationIds).toHaveLength(46);
    expect(controlOperationIds.every((id) => id.startsWith('control.'))).toBe(
      true,
    );
    expect(
      controlOperationIds.filter((id) =>
        id.startsWith('control.cli-auth-api-'),
      ),
    ).toHaveLength(8);
    expect(
      controlOperationIds.filter(
        (id) =>
          id.startsWith('control.cli-') &&
          !id.startsWith('control.cli-auth-api-'),
      ),
    ).toHaveLength(0);
    expect(controlOperationIds).not.toContain('control.resolve-access.v1');

    const processorOperationIds = generatedOperationIds(generatedProcessor);
    expect(processorOperationIds).toHaveLength(43);
    for (const operationId of targetOperationIds)
      expect(processorOperationIds).toContain(operationId);
    expect(
      processorOperationIds.filter((id) => id.startsWith('orders.')),
    ).toEqual([
      'orders.accept-incoming-order-proposal.v1',
      'orders.list-incoming-order-proposals.v1',
      'orders.reject-incoming-order-proposal.v1',
      'orders.restore-incoming-order-proposal.v1',
    ]);
    expect(
      processorOperationIds.filter((id) => id.startsWith('processor.')),
    ).toHaveLength(11);
    expect(
      processorOperationIds.filter((id) => id.startsWith('production.')),
    ).toHaveLength(28);
    for (const operationId of [
      'production.list-history-activity.v1',
      'production.list-order-control.v1',
      'production.load-board.v1',
      'production.load-history-run.v1',
      'production.load-remaining-day-forecast.v1',
      'production.load-workspace.v1',
      'production.preview-order-backlog.v1',
    ])
      expect(processorOperationIds).not.toContain(operationId);

    for (const source of [
      generatedCustomer,
      generatedControl,
      generatedProcessor,
    ]) {
      expect(source).not.toContain('@pressly/access-system');
      expect(source).not.toContain('@pressly/customers-system');
      expect(source).not.toContain('@pressly/orders-system');
    }
  });

  it('composes Experience factories with generated metadata and no route literals', () => {
    const control = readFileSync(
      resolve(repositoryRoot, 'generated/runtime/src/browser/control.ts'),
      'utf8',
    );
    const processor = readFileSync(
      resolve(repositoryRoot, 'generated/runtime/src/browser/processor.ts'),
      'utf8',
    );

    expect(control).toContain('@pressly/experience-control/browser');
    expect(control).toContain('@pressly/generated/clients/control');
    expect(processor).toContain('@pressly/experience-processor/browser');
    expect(processor).toContain('@pressly/generated/clients/processor');
    expect(control).not.toMatch(/['"`]\/control\//u);
    expect(processor).not.toMatch(
      /['"`]\/(?:processor\/auth|order-management)\//u,
    );
  });
});
