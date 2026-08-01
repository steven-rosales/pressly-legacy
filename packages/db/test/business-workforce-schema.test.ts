import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  auth,
  business,
  getTableConfig,
  getTableName,
  orders,
  users,
} from '../src/index.ts';

describe('business ancestry and workforce authority schema', () => {
  it('exports separate business, membership, invitation, and grant roots', () => {
    expect(getTableName(business.businessAccounts)).toBe('business_accounts');
    expect(getTableName(business.productionLocations)).toBe(
      'production_locations',
    );
    expect(getTableName(auth.workforceMemberships)).toBe(
      'workforce_memberships',
    );
    expect(getTableName(auth.workforceInvitations)).toBe(
      'workforce_invitations',
    );
    expect(getTableName(auth.authAccessGrants)).toBe('auth_access_grants');
    expect(getTableName(auth.authLifecycleTransitions)).toBe(
      'auth_lifecycle_transitions',
    );
    expect(getTableName(auth.authCommandReceipts)).toBe(
      'auth_command_receipts',
    );
  });

  it('requires business ancestry on customer and Order roots', () => {
    expect(business.productionLocations.businessId.notNull).toBe(true);
    expect(users.users.businessId.notNull).toBe(true);
    expect(users.userCommandReceipts.businessId.notNull).toBe(true);
    expect(orders.orders.businessId.notNull).toBe(true);
    expect(orders.orderItems.businessId.notNull).toBe(true);
    expect(orders.orderFulfillments.businessId.notNull).toBe(true);

    const orderForeignKeys = getTableConfig(orders.orders).foreignKeys.map(
      (foreignKey) => foreignKey.getName(),
    );
    const fulfillmentForeignKeys = getTableConfig(
      orders.orderFulfillments,
    ).foreignKeys.map((foreignKey) => foreignKey.getName());
    expect(orderForeignKeys).toContain('orders_customer_business_fk');
    expect(fulfillmentForeignKeys).toContain(
      'order_fulfillments_order_business_fk',
    );
    expect(fulfillmentForeignKeys).toContain(
      'order_fulfillments_location_business_fk',
    );
  });

  it('stores only a hashed invitation token and constrains lifecycle data', () => {
    expect(auth.workforceInvitations.tokenHash.name).toBe('token_hash');
    expect('acceptanceToken' in auth.workforceInvitations).toBe(false);
    expect(
      getTableConfig(auth.workforceInvitations).checks.map(
        (constraint) => constraint.name,
      ),
    ).toEqual(
      expect.arrayContaining([
        'workforce_invitations_token_hash_shape',
        'workforce_invitations_state_timestamps_valid',
      ]),
    );
    expect(
      getTableConfig(auth.authAccessGrants).checks.map(
        (constraint) => constraint.name,
      ),
    ).toEqual(
      expect.arrayContaining([
        'auth_access_grants_role_scope_valid',
        'auth_access_grants_state_timestamps_valid',
      ]),
    );
  });

  it('backfills before enforcing ancestry and preserves legacy authority', async () => {
    const migration = await readFile(
      new URL(
        '../src/migrations/0038_smooth_omega_sentinel.sql',
        import.meta.url,
      ),
      'utf8',
    );
    const addLocation =
      'ALTER TABLE "production_locations" ADD COLUMN "business_id" uuid;';
    const locationBackfill = 'UPDATE "production_locations"\nSET "business_id"';
    const locationRequired =
      'ALTER TABLE "production_locations" ALTER COLUMN "business_id" SET NOT NULL;';

    expect(migration).toContain("'00000000-0000-4000-8000-000000000100'");
    expect(migration.indexOf(locationBackfill)).toBeGreaterThan(
      migration.indexOf(addLocation),
    );
    expect(migration.indexOf(locationRequired)).toBeGreaterThan(
      migration.indexOf(locationBackfill),
    );
    expect(migration).toContain('INSERT INTO "workforce_memberships"');
    expect(migration).toContain('INSERT INTO "auth_access_grants"');
    expect(migration).toContain(
      'Legacy admin is intentionally not reclassified as manager',
    );
    expect(migration).toContain('PRESSLY_LAST_OWNER_REQUIRED');
    expect(migration).toContain('auth_access_grants_last_owner_guard');
    expect(migration).toContain('workforce_memberships_last_owner_guard');
    expect(migration).toContain('auth_identities_last_owner_guard');
    expect(migration).toContain('workforce_invitations_lifecycle_guard');
    expect(migration).toContain('auth_command_receipts_immutable');
    expect(migration).not.toContain('"acceptance_token"');
  });
});
