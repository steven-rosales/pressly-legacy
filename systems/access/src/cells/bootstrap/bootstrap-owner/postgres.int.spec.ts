import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import { expectErrCode, expectOk } from '@pressly/testkit/result';
import {
  accessPostgresForcedRollbackUnitOfWork,
  accessPostgresProofBusinessId,
  accessPostgresProofDatabase,
  useAccessPostgresProof,
} from '../../../testing/postgres.spec-support.ts';
import { accessTestSchema as accessPostgresProofSchema } from '../../../testing/schema.ts';
import { makeBootstrapOwnerStore } from './bootstrap-owner.repo.ts';
import { bootstrapOwnerCellDeclaration } from './cell.ts';
import { makePostgresBootstrapOwner } from './postgres.ts';

useAccessPostgresProof();

const business = {
  businessId: accessPostgresProofBusinessId,
  businessSlug: 'pressly-one',
  businessDisplayName: 'Pressly One',
} as const;

const ownerInput = (
  email: string,
  passwordHash: string,
  passwordMatches = true,
) => ({
  ...business,
  email,
  emailNormalized: email,
  passwordHash,
  verifyExistingPassword: async () => passwordMatches,
});

proveOperation({
  operationId: 'access.bootstrap-owner.v2',
  declaration: bootstrapOwnerCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'serializes concurrent first-owner creation into one complete owner graph',
      proves: [
        'postgres-commit',
        'expected-rejection-no-partial-write',
        'same-payload-replay',
        'declared-concurrency-race',
      ],
      run: async () => {
        const store = makeBootstrapOwnerStore(
          accessPostgresProofDatabase.db,
          accessPostgresProofSchema,
        );
        const outcomes = await Promise.all([
          store.createFirstOwner(
            ownerInput('first-owner@pressly.test', 'hash-one'),
          ),
          store.createFirstOwner(
            ownerInput('first-owner@pressly.test', 'hash-two'),
          ),
        ]);

        expect(outcomes.map(({ status }) => status).sort()).toEqual([
          'created',
          'replayed',
        ]);
        await expect(
          store.createFirstOwner(
            ownerInput('different-owner@pressly.test', 'hash-three'),
          ),
        ).resolves.toEqual({ status: 'owner_exists' });
        await expect(
          accessPostgresProofDatabase.db
            .select()
            .from(accessPostgresProofSchema.businessAccounts),
        ).resolves.toHaveLength(1);
        await expect(
          accessPostgresProofDatabase.db
            .select()
            .from(accessPostgresProofSchema.authIdentities),
        ).resolves.toHaveLength(1);
        await expect(
          accessPostgresProofDatabase.db
            .select()
            .from(accessPostgresProofSchema.authPasswordCredentials),
        ).resolves.toHaveLength(1);
        const [credentialBeforeReplay] = await accessPostgresProofDatabase.db
          .select()
          .from(accessPostgresProofSchema.authPasswordCredentials);
        await expect(
          store.createFirstOwner(
            ownerInput('first-owner@pressly.test', 'replacement-hash'),
          ),
        ).resolves.toMatchObject({ status: 'replayed' });
        await expect(
          store.createFirstOwner(
            ownerInput(
              'first-owner@pressly.test',
              'divergent-password-hash',
              false,
            ),
          ),
        ).resolves.toEqual({ status: 'credential_conflict' });
        const [credentialAfterReplay] = await accessPostgresProofDatabase.db
          .select()
          .from(accessPostgresProofSchema.authPasswordCredentials);
        expect(credentialAfterReplay?.passwordHash).toBe(
          credentialBeforeReplay?.passwordHash,
        );
        const [rootIdentity] = await accessPostgresProofDatabase.db
          .select({ id: accessPostgresProofSchema.authIdentities.id })
          .from(accessPostgresProofSchema.authIdentities);
        const [additionalIdentity] = await accessPostgresProofDatabase.db
          .insert(accessPostgresProofSchema.authIdentities)
          .values({
            kind: 'human',
            displayName: 'Additional Owner',
            email: 'additional-owner@pressly.test',
            emailNormalized: 'additional-owner@pressly.test',
          })
          .returning({ id: accessPostgresProofSchema.authIdentities.id });
        expect(rootIdentity).toBeDefined();
        expect(additionalIdentity).toBeDefined();
        if (rootIdentity === undefined || additionalIdentity === undefined)
          return;
        await accessPostgresProofDatabase.db
          .insert(accessPostgresProofSchema.authPasswordCredentials)
          .values({
            identityId: additionalIdentity.id,
            passwordHash: 'additional-owner-hash',
          });
        const [additionalMembership] = await accessPostgresProofDatabase.db
          .insert(accessPostgresProofSchema.workforceMemberships)
          .values({
            businessId: accessPostgresProofBusinessId,
            identityId: additionalIdentity.id,
            state: 'active',
          })
          .returning({ id: accessPostgresProofSchema.workforceMemberships.id });
        expect(additionalMembership).toBeDefined();
        if (additionalMembership === undefined) return;
        await accessPostgresProofDatabase.db
          .insert(accessPostgresProofSchema.authAccessGrants)
          .values({
            businessId: accessPostgresProofBusinessId,
            membershipId: additionalMembership.id,
            identityId: additionalIdentity.id,
            role: 'owner',
            scopeKind: 'business',
            scopeId: accessPostgresProofBusinessId,
            scopeResourceType: '*',
            state: 'active',
            createdByIdentityId: rootIdentity.id,
          });
        await expect(
          store.createFirstOwner(
            ownerInput('first-owner@pressly.test', 'root-owner-replay-hash'),
          ),
        ).resolves.toMatchObject({ status: 'replayed' });
        await expect(
          accessPostgresProofDatabase.db
            .select()
            .from(accessPostgresProofSchema.workforceMemberships),
        ).resolves.toHaveLength(2);
        await expect(
          accessPostgresProofDatabase.db
            .select()
            .from(accessPostgresProofSchema.authAccessGrants),
        ).resolves.toHaveLength(2);
        await expect(
          accessPostgresProofDatabase.db
            .select()
            .from(accessPostgresProofSchema.authAuditEvents),
        ).resolves.toHaveLength(1);
      },
    },
    {
      name: 'uses a matching active business and rejects incompatible ID or slug facts without partial state',
      proves: ['postgres-commit', 'expected-rejection-no-partial-write'],
      run: async () => {
        await accessPostgresProofDatabase.db
          .insert(accessPostgresProofSchema.businessAccounts)
          .values({
            id: accessPostgresProofBusinessId,
            slug: business.businessSlug,
            displayName: business.businessDisplayName,
            status: 'active',
          });
        const store = makeBootstrapOwnerStore(
          accessPostgresProofDatabase.db,
          accessPostgresProofSchema,
        );

        await expect(
          store.createFirstOwner(
            ownerInput('matching-owner@pressly.test', 'matching-hash'),
          ),
        ).resolves.toMatchObject({ status: 'created' });
        await expect(
          accessPostgresProofDatabase.db
            .select()
            .from(accessPostgresProofSchema.businessAccounts),
        ).resolves.toHaveLength(1);
      },
    },
    {
      name: 'assembles real replay verification and rejects a divergent password without credential mutation',
      proves: ['postgres-commit', 'same-payload-replay'],
      run: async () => {
        const bootstrapOwner = makePostgresBootstrapOwner(
          accessPostgresProofDatabase.db,
          accessPostgresProofSchema,
          {
            hashPassword: async (password) => `hash:${password}`,
            verifyPassword: async (passwordHash, password) =>
              passwordHash === `hash:${password}`,
          },
        );
        const command = {
          ...business,
          email: 'assembled-owner@pressly.test',
          password: 'CorrectHorse1!Battery',
          confirmation: 'bootstrap-first-owner',
        };

        expect(expectOk(await bootstrapOwner(command))).toMatchObject({
          replayed: false,
        });
        expect(expectOk(await bootstrapOwner(command))).toMatchObject({
          replayed: true,
        });
        expectErrCode(
          await bootstrapOwner({
            ...command,
            password: 'DifferentHorse2!Battery',
          }),
          'bootstrap_owner_credential_conflict',
        );
        const [credential] = await accessPostgresProofDatabase.db
          .select()
          .from(accessPostgresProofSchema.authPasswordCredentials);
        expect(credential?.passwordHash).toBe('hash:CorrectHorse1!Battery');
      },
    },
    {
      name: 'rejects incompatible existing business ID and slug facts before owner creation',
      proves: ['expected-rejection-no-partial-write'],
      run: async () => {
        await accessPostgresProofDatabase.db
          .insert(accessPostgresProofSchema.businessAccounts)
          .values([
            {
              id: accessPostgresProofBusinessId,
              slug: 'different-business',
              displayName: business.businessDisplayName,
              status: 'active',
            },
            {
              id: '87000000-0000-4000-8000-000000000002',
              slug: business.businessSlug,
              displayName: 'Slug Owner',
              status: 'active',
            },
          ]);
        const store = makeBootstrapOwnerStore(
          accessPostgresProofDatabase.db,
          accessPostgresProofSchema,
        );

        await expect(
          store.createFirstOwner(
            ownerInput('conflict-owner@pressly.test', 'conflict-hash'),
          ),
        ).resolves.toEqual({ status: 'business_conflict' });
        await expect(
          accessPostgresProofDatabase.db
            .select()
            .from(accessPostgresProofSchema.authIdentities),
        ).resolves.toHaveLength(0);
        await expect(
          accessPostgresProofDatabase.db
            .select()
            .from(accessPostgresProofSchema.authPasswordCredentials),
        ).resolves.toHaveLength(0);
      },
    },
    {
      name: 'rolls back the complete owner graph after a forced late failure',
      proves: ['unexpected-failure-rollback'],
      run: async () => {
        const store = makeBootstrapOwnerStore(
          accessPostgresProofDatabase.db,
          accessPostgresProofSchema,
          accessPostgresForcedRollbackUnitOfWork,
        );

        await expect(
          store.createFirstOwner(
            ownerInput('rollback-owner@pressly.test', 'rollback-password-hash'),
          ),
        ).rejects.toMatchObject({ code: 'access_write_forced_rollback' });
        await expect(
          accessPostgresProofDatabase.db
            .select()
            .from(accessPostgresProofSchema.businessAccounts),
        ).resolves.toHaveLength(0);
        await expect(
          accessPostgresProofDatabase.db
            .select()
            .from(accessPostgresProofSchema.authIdentities),
        ).resolves.toHaveLength(0);
        await expect(
          accessPostgresProofDatabase.db
            .select()
            .from(accessPostgresProofSchema.workforceMemberships),
        ).resolves.toHaveLength(0);
        await expect(
          accessPostgresProofDatabase.db
            .select()
            .from(accessPostgresProofSchema.authAccessGrants),
        ).resolves.toHaveLength(0);
        await expect(
          accessPostgresProofDatabase.db
            .select()
            .from(accessPostgresProofSchema.authAuditEvents),
        ).resolves.toHaveLength(0);
      },
    },
  ],
});
