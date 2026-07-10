import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const eslint = new ESLint({ cwd: repoRoot });

const lint = async (filePath, source) => {
  const [result] = await eslint.lintText(source, {
    filePath: path.join(repoRoot, filePath),
  });

  return result.messages.filter((message) => message.severity === 2);
};

const expectAllowed = async (filePath, source) => {
  expect(await lint(filePath, source)).toEqual([]);
};

const expectRejectedBy = async (filePath, source, ruleId) => {
  const messages = await lint(filePath, source);

  expect(messages.map((message) => message.ruleId)).toContain(ruleId);
};

describe('module architecture boundaries', () => {
  it('allows a usecase to depend on a same-capability port', async () => {
    await expectAllowed(
      'modules/business/auth/src/login/login.usecase.ts',
      `
        import type { LoginStore } from './login.port.ts';
        export type Login = LoginStore;
      `,
    );
  });

  it('allows persistence adapters to use the database and explicit persistence foundation', async () => {
    await expectAllowed(
      'modules/business/auth/src/login/login.repo.ts',
      `
        import { auth } from '@pressly/db';
        import type { LoginStore } from './login.port.ts';
        import { toDatabaseResult } from '../persistence/database-result.ts';
        export const dependencies = { auth, toDatabaseResult };
        export type Store = LoginStore;
      `,
    );
  });

  it('allows access-control capabilities to use the explicit identity foundation', async () => {
    await expectAllowed(
      'modules/policy/access-control/src/mfa/mfa.guard.ts',
      `
        import { authIdentityResourceFromRequest } from '../identity/auth-identity.resource.ts';
        export const readResource = authIdentityResourceFromRequest;
      `,
    );
  });

  it('allows the intentionally HTTP-shaped access-control auth port to import HTTP types', async () => {
    await expectAllowed(
      'modules/policy/access-control/src/auth.port.ts',
      `
        import type { Request, RequestHandler } from 'express';
        export type Authenticate = (request: Request) => RequestHandler;
      `,
    );
  });

  it('allows business ports to import mechanism-free application types', async () => {
    await expectAllowed(
      'modules/business/auth/src/login/login.port.ts',
      `
        import type { AppError } from '@pressly/errors';
        export type LoginFailure = AppError;
      `,
    );
  });

  it('allows recursively nested capability files when their role is explicit', async () => {
    await expectAllowed(
      'modules/business/auth/src/login/internal/login.policy.ts',
      'export const canLogin = true;',
    );
  });

  it('rejects database access from usecases', async () => {
    await expectRejectedBy(
      'modules/business/auth/src/login/login.usecase.ts',
      `
        import { auth } from '@pressly/db';
        export const leakedDatabase = auth;
      `,
      '@typescript-eslint/no-restricted-imports',
    );
  });

  it('rejects imports between sibling capabilities', async () => {
    await expectRejectedBy(
      'modules/business/auth/src/login/login.command.ts',
      `
        import { completeMfa } from '../mfa/complete-mfa.command.ts';
        export const command = completeMfa;
      `,
      'architecture/module-capability-imports',
    );
  });

  it('rejects dynamic imports between sibling capabilities', async () => {
    await expectRejectedBy(
      'modules/business/auth/src/login/login.command.ts',
      `
        export const loadMfaCommand = () => import('../mfa/complete-mfa.command.ts');
      `,
      'architecture/module-capability-imports',
    );
  });

  it('rejects database types from business ports', async () => {
    await expectRejectedBy(
      'modules/business/auth/src/login/login.port.ts',
      `
        import type { Database } from '@pressly/db';
        export type LoginStore = Database;
      `,
      '@typescript-eslint/no-restricted-imports',
    );
  });

  it('rejects UI types from computation ports', async () => {
    await expectRejectedBy(
      'modules/computation/scheduler/src/propose/propose.port.ts',
      `
        import type { ReactNode } from 'react';
        export type ScheduleProposal = ReactNode;
      `,
      '@typescript-eslint/no-restricted-imports',
    );
  });

  it('rejects runtime imports from the access-control auth port', async () => {
    await expectRejectedBy(
      'modules/policy/access-control/src/auth.port.ts',
      `
        import { Router } from 'express';
        export const leakedRuntime = Router;
      `,
      '@typescript-eslint/no-restricted-imports',
    );
  });

  it('rejects framework imports from intrinsic policy', async () => {
    await expectRejectedBy(
      'modules/business/pricing/src/publish-pricing/publish-pricing.policy.ts',
      `
        import type { Request } from 'express';
        export type PolicyInput = Request;
      `,
      '@typescript-eslint/no-restricted-imports',
    );
  });

  it('rejects persistence mechanisms from the auth HTTP foundation', async () => {
    await expectRejectedBy(
      'modules/business/auth/src/http/auth-context.ts',
      `
        import { auth } from '@pressly/db';
        export const leakedDatabase = auth;
      `,
      '@typescript-eslint/no-restricted-imports',
    );
  });

  it('rejects HTTP mechanisms from the auth persistence foundation', async () => {
    await expectRejectedBy(
      'modules/business/auth/src/persistence/database-result.ts',
      `
        import type { Request } from 'express';
        export type LeakedRequest = Request;
      `,
      '@typescript-eslint/no-restricted-imports',
    );
  });

  it('rejects module-local common and shared catch-all folders', async () => {
    await expectRejectedBy(
      'modules/business/auth/src/common/database-result.ts',
      'export const value = 1;',
      'no-restricted-syntax',
    );
  });

  it('rejects arbitrary filenames at any depth inside a capability', async () => {
    await expectRejectedBy(
      'modules/business/auth/src/login/internal/arbitrary.ts',
      'export const value = 1;',
      'no-restricted-syntax',
    );
  });
});

describe('web architecture boundaries', () => {
  it('allows app routes to compose product features and concrete runtime adapters', async () => {
    await expectAllowed(
      'apps/web/src/app/(marketing)/pricing/page.tsx',
      `
        import { loadPricing } from '@/features/pricing/server';
        import { makeServerWebCore } from '@/common/adapters/runtime/server-web-core';
        export const dependencies = { loadPricing, makeServerWebCore };
      `,
    );
  });

  it('allows feature server composition to select a concrete adapter', async () => {
    await expectAllowed(
      'apps/web/src/features/pricing/server.ts',
      `
        import { makeServerWebCore } from '@/common/adapters/runtime/server-web-core';
        export const makeRuntime = makeServerWebCore;
      `,
    );
  });

  it('allows ordinary features to depend on web core through a relative path', async () => {
    await expectAllowed(
      'apps/web/src/features/pricing/model.ts',
      `
        import type { WebCore } from '../../common/core/runtime/core';
        export type PricingRuntime = WebCore;
      `,
    );
  });

  it('allows a route subtree to use its own private code', async () => {
    await expectAllowed(
      'apps/web/src/app/schedule/page.tsx',
      `
        import { ScheduleFrame } from './_components/ScheduleFrame';
        export const Frame = ScheduleFrame;
      `,
    );
  });

  it('rejects product imports from web core', async () => {
    await expectRejectedBy(
      'apps/web/src/common/core/runtime/core.ts',
      `
        import { loadPricing } from '@/features/pricing/queries';
        export const leakedFeature = loadPricing;
      `,
      'architecture/web-zone-imports',
    );
  });

  it('rejects relative product imports from web core', async () => {
    await expectRejectedBy(
      'apps/web/src/common/core/runtime/core.ts',
      `
        import { pricingCatalog } from '../../../features/pricing/model';
        export const leakedFeature = pricingCatalog;
      `,
      'architecture/web-zone-imports',
    );
  });

  it('rejects dynamic relative route imports from web features', async () => {
    await expectRejectedBy(
      'apps/web/src/features/pricing/model.ts',
      `
        export const loadScheduleModel = () => import('../../app/schedule/model');
      `,
      'architecture/web-zone-imports',
    );
  });

  it('rejects route and product imports from concrete adapters', async () => {
    await expectRejectedBy(
      'apps/web/src/common/adapters/requests/pricing-client.ts',
      `
        import { loadPricing } from '@/features/pricing/queries';
        export const leakedFeature = loadPricing;
      `,
      'architecture/web-zone-imports',
    );
  });

  it('rejects concrete adapter selection from ordinary feature logic', async () => {
    await expectRejectedBy(
      'apps/web/src/features/pricing/queries.ts',
      `
        import { makeFetchRequestClient } from '@/common/adapters/requests/fetch-request-client';
        export const leakedAdapter = makeFetchRequestClient;
      `,
      'architecture/web-zone-imports',
    );
  });

  it('rejects product dependencies from UI primitives', async () => {
    await expectRejectedBy(
      'apps/web/src/components/ui/button.tsx',
      `
        import { loadPricing } from '@/features/pricing/queries';
        export const leakedFeature = loadPricing;
      `,
      'architecture/web-zone-imports',
    );
  });

  it('rejects private route imports from outside the owning subtree', async () => {
    await expectRejectedBy(
      'apps/web/src/app/account/page.tsx',
      `
        import { ScheduleFrame } from '@/app/schedule/_components/ScheduleFrame';
        export const leakedPrivateView = ScheduleFrame;
      `,
      'architecture/web-private-route-imports',
    );
  });

  it('rejects dynamic relative imports of another route subtree private code', async () => {
    await expectRejectedBy(
      'apps/web/src/app/account/page.tsx',
      `
        export const loadScheduleFrame = () => import('../schedule/_components/ScheduleFrame');
      `,
      'architecture/web-private-route-imports',
    );
  });

  it('rejects legacy app-wide shared buckets', async () => {
    await expectRejectedBy(
      'apps/web/src/app/shared/marketing/pricing.ts',
      'export const value = 1;',
      'no-restricted-syntax',
    );
  });
});
