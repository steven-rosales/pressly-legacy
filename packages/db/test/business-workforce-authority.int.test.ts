import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';

const requiredUrl = (name: string): string => {
  const value = process.env[name];
  if (value) return value;
  throw new Error(`${name} is required for workforce authority tests.`);
};

const db = postgres(requiredUrl('PRESSLY_TEST_MIGRATION_DATABASE_URL'), {
  max: 1,
});

const fixtureIds = () => ({
  businessId: randomUUID(),
  firstIdentityId: randomUUID(),
  firstMembershipId: randomUUID(),
  firstGrantId: randomUUID(),
  secondIdentityId: randomUUID(),
  secondMembershipId: randomUUID(),
  secondGrantId: randomUUID(),
  slug: `owner-guard-${randomUUID().replaceAll('-', '')}`,
});

afterAll(async () => {
  await db.end();
});

describe.sequential('workforce owner authority', () => {
  it('rejects deactivation of the final effective owner identity', async () => {
    const ids = fixtureIds();

    await expect(
      db.begin(async (transaction) => {
        await transaction`
          insert into business_accounts (id, slug, display_name)
          values (${ids.businessId}, ${ids.slug}, 'Owner guard test')
        `;
        await transaction`
          insert into auth_identities (id, kind, display_name)
          values (${ids.firstIdentityId}, 'human', 'First owner')
        `;
        await transaction`
          insert into workforce_memberships (
            id, business_id, identity_id, state, version
          ) values (
            ${ids.firstMembershipId},
            ${ids.businessId},
            ${ids.firstIdentityId},
            'active',
            1
          )
        `;
        await transaction`
          insert into auth_access_grants (
            id,
            business_id,
            membership_id,
            identity_id,
            role,
            scope_kind,
            scope_id,
            scope_resource_type,
            state,
            version,
            starts_at,
            created_by_identity_id
          ) values (
            ${ids.firstGrantId},
            ${ids.businessId},
            ${ids.firstMembershipId},
            ${ids.firstIdentityId},
            'owner',
            'business',
            ${ids.businessId},
            '*',
            'active',
            1,
            now(),
            ${ids.firstIdentityId}
          )
        `;
        await transaction`
          update auth_identities
          set is_active = false, updated_at = now()
          where id = ${ids.firstIdentityId}
        `;
        await transaction`set constraints all immediate`;
      }),
    ).rejects.toThrow(/PRESSLY_LAST_OWNER_REQUIRED/);
  });

  it('permits an atomic owner replacement in the same transaction', async () => {
    const ids = fixtureIds();

    await expect(
      db.begin(async (transaction) => {
        await transaction`
          insert into business_accounts (id, slug, display_name)
          values (${ids.businessId}, ${ids.slug}, 'Owner replacement test')
        `;
        await transaction`
          insert into auth_identities (id, kind, display_name)
          values
            (${ids.firstIdentityId}, 'human', 'First owner'),
            (${ids.secondIdentityId}, 'human', 'Second owner')
        `;
        await transaction`
          insert into workforce_memberships (
            id, business_id, identity_id, state, version
          ) values
            (
              ${ids.firstMembershipId},
              ${ids.businessId},
              ${ids.firstIdentityId},
              'active',
              1
            ),
            (
              ${ids.secondMembershipId},
              ${ids.businessId},
              ${ids.secondIdentityId},
              'active',
              1
            )
        `;
        await transaction`
          insert into auth_access_grants (
            id,
            business_id,
            membership_id,
            identity_id,
            role,
            scope_kind,
            scope_id,
            scope_resource_type,
            state,
            version,
            starts_at,
            created_by_identity_id
          ) values
            (
              ${ids.firstGrantId},
              ${ids.businessId},
              ${ids.firstMembershipId},
              ${ids.firstIdentityId},
              'owner',
              'business',
              ${ids.businessId},
              '*',
              'active',
              1,
              now(),
              ${ids.firstIdentityId}
            ),
            (
              ${ids.secondGrantId},
              ${ids.businessId},
              ${ids.secondMembershipId},
              ${ids.secondIdentityId},
              'owner',
              'business',
              ${ids.businessId},
              '*',
              'active',
              1,
              now(),
              ${ids.firstIdentityId}
            )
        `;
        await transaction`
          update auth_identities
          set is_active = false, updated_at = now()
          where id = ${ids.firstIdentityId}
        `;
        await transaction`set constraints all immediate`;

        throw new Error('ROLLBACK_OWNER_REPLACEMENT_FIXTURE');
      }),
    ).rejects.toThrow('ROLLBACK_OWNER_REPLACEMENT_FIXTURE');
  });
});
