import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { hash } from 'argon2';
import { normalizeEmail, validatePasswordStrength } from '@pressly/auth';
import { validationError } from '@pressly/errors';
import { createDatabaseRuntime } from '../client.ts';
import { eq } from '../query.ts';
import * as auth from '../schema/auth.schema.ts';

loadEnv({
  path: resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../apps/api/.env.local',
  ),
});

const readRequired = (key: string): string => {
  const value = process.env[key];

  if (value !== undefined && value.trim() !== '') return value;

  throw validationError({
    code: 'missing_seed_env',
    message: `${key} is required to see the first admin.`,
    safeMessage: `${key} is required.`,
    details: { key },
  });
};

const databaseUrl = readRequired('DATABASE_URL');
const email = readRequired('PRESSLY_ADMIN_EMAIL');
const password = readRequired('PRESSLY_ADMIN_PASSWORD');
const normalizedEmail = normalizeEmail(email);
const violations = validatePasswordStrength(password);

if (violations.length > 0)
  throw validationError({
    code: 'weak_admin_password',
    message: 'Admin password does not meet strength requirements.',
    safeMessage: 'Admin password is too weak.',
    details: { violations },
  });

const database = createDatabaseRuntime({
  databaseUrl,
  maxConnections: 1,
});

try {
  const passwordHash = await hash(password);

  await database.db.transaction(async (tx) => {
    const [existingIdentity] = await tx
      .select()
      .from(auth.authIdentities)
      .where(eq(auth.authIdentities.emailNormalized, normalizedEmail))
      .limit(1);

    const [identity] =
      existingIdentity === undefined
        ? await tx
            .insert(auth.authIdentities)
            .values({
              kind: 'human',
              displayName: email,
              email,
              emailNormalized: normalizedEmail,
              isActive: true,
            })
            .returning()
        : await tx
            .update(auth.authIdentities)
            .set({
              displayName: existingIdentity.displayName,
              email,
              emailNormalized: normalizedEmail,
              isActive: true,
              updatedAt: new Date(),
            })
            .returning();

    if (identity === undefined)
      throw validationError({
        code: 'admin_seed_identity_failed',
        message: 'Could not create admin identity.',
        safeMessage: 'Could not seed admin user.',
      });

    const [credential] = await tx
      .select()
      .from(auth.authPasswordCredentials)
      .where(eq(auth.authPasswordCredentials.identityId, identity.id))
      .limit(1);

    if (credential === undefined) {
      await tx.insert(auth.authPasswordCredentials).values({
        identityId: identity.id,
        passwordHash,
      });
    } else {
      await tx
        .update(auth.authPasswordCredentials)
        .set({
          passwordHash,
          passwordUpdatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(auth.authPasswordCredentials.id, credential.id));
    }

    const [ownerRole] = await tx
      .select()
      .from(auth.authIdentityRoles)
      .where(eq(auth.authIdentityRoles, identity.id))
      .limit(1);

    if (ownerRole === undefined)
      await tx.insert(auth.authIdentityRoles).values({
        identityId: identity.id,
        role: 'owner',
      });

    await tx.insert(auth.authAuditEvents).values({
      actorIdentityId: identity.id,
      eventType: 'auth.identity.seeded',
      resourceType: 'auth_identity',
      resourceId: identity.id,
      metadata: { email: normalizedEmail, role: 'owner' },
    });

    console.log('admin seed completed');
  });
} finally {
  database.close();
}
