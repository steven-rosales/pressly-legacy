import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = fileURLToPath(
  new URL('../../../platform/auth/', import.meta.url),
);
const accessRoot = fileURLToPath(
  new URL('../../../systems/access/', import.meta.url),
);
const controlRoot = fileURLToPath(
  new URL('../../../experiences/control/', import.meta.url),
);
const sourceFiles = [
  'cookies.ts',
  'csrf.ts',
  'hmac-sha256.ts',
  'passwords.ts',
  'recovery-codes.ts',
  'secret-box.ts',
  'tokens.ts',
  'totp.ts',
] as const;

describe('platform auth ownership boundary', () => {
  it('exposes only explicit mechanism subpaths and no package root', async () => {
    const manifest = JSON.parse(
      await readFile(`${packageRoot}/package.json`, 'utf8'),
    ) as Readonly<{ exports?: Readonly<Record<string, unknown>> }>;
    expect(Object.keys(manifest.exports ?? {}).sort()).toEqual([
      './cookies',
      './csrf',
      './hmac-sha256',
      './passwords',
      './recovery-codes',
      './secret-box',
      './tokens',
      './totp',
    ]);
    expect(Object.hasOwn(manifest.exports ?? {}, '.')).toBe(false);
  });

  it('contains mechanisms without Pressly identity, access, policy, persistence, or realm ownership', async () => {
    const source = (
      await Promise.all(
        sourceFiles.map((file) =>
          readFile(`${packageRoot}/src/${file}`, 'utf8'),
        ),
      )
    ).join('\n');
    expect(source).not.toMatch(
      /\b(?:Pressly|role|capability|workforce|principal|authorization|audit|business(?:Id|Scope)?|location(?:Id|Scope)?|postgres|drizzle|sessionTtl|idleTimeout|realm)\b/u,
    );
    expect(source).not.toMatch(
      /process\.env|from ['"]express['"]|@pressly\/(?:access|db|identity)/u,
    );
    expect(source).not.toMatch(
      /normalizeEmail|isSessionExpired|sessionAgeMinutes/u,
    );
  });

  it('is adopted by Access through explicit mechanism subpaths only', async () => {
    const sourcePaths = (
      await readdir(`${accessRoot}/src`, { recursive: true })
    )
      .filter((path) => path.endsWith('.ts'))
      .sort();
    const sources = await Promise.all(
      sourcePaths.map((path) => readFile(`${accessRoot}/src/${path}`, 'utf8')),
    );
    const source = sources.join('\n');
    expect(source).not.toContain('@pressly/auth/credentials');

    expect(source).not.toMatch(/@pressly\/auth(?:\/|['"])/u);

    for (const subpath of [
      'passwords',
      'recovery-codes',
      'secret-box',
      'tokens',
      'totp',
    ])
      expect(source).toContain(`@pressly/auth-platform/${subpath}`);

    const passwordPolicyConsumers = sourcePaths.filter(
      (path, index) =>
        !path.endsWith('.spec.ts') &&
        sources[index]?.includes('validatePasswordStrength } from') === true,
    );
    expect(passwordPolicyConsumers).toHaveLength(2);

    const accessManifest = JSON.parse(
      await readFile(`${accessRoot}/package.json`, 'utf8'),
    ) as Readonly<{ exports?: Readonly<Record<string, unknown>> }>;
    expect(accessManifest.exports?.['./password-policy']).toEqual({
      types: './dist/model/language/password-strength.d.ts',
      import: './dist/model/language/password-strength.js',
      default: './dist/model/language/password-strength.js',
    });
    const controlManifest = JSON.parse(
      await readFile(`${controlRoot}/package.json`, 'utf8'),
    ) as Readonly<{ dependencies?: Readonly<Record<string, string>> }>;
    expect(controlManifest.dependencies?.['@pressly/access-system']).toBe(
      'workspace:*',
    );
    expect(controlManifest.dependencies?.['@pressly/auth']).toBeUndefined();
    const controlInvitation = await readFile(
      `${controlRoot}/src/features/team/invitation-acceptance-view.tsx`,
      'utf8',
    );
    expect(controlInvitation).toContain(
      'from "@pressly/access-system/password-policy"',
    );
    expect(controlInvitation).not.toContain('@pressly/auth/password-policy');
  });

  it('exposes both owner language surfaces from Access', async () => {
    const manifest = JSON.parse(
      await readFile(`${accessRoot}/package.json`, 'utf8'),
    ) as Readonly<{ exports?: Readonly<Record<string, unknown>> }>;
    expect(manifest.exports?.['./authentication']).toEqual({
      types: './dist/model/authentication/public.d.ts',
      import: './dist/model/authentication/public.js',
      default: './dist/model/authentication/public.js',
    });
    expect(manifest.exports?.['./authorization']).toEqual({
      types: './dist/model/authorization/public.d.ts',
      import: './dist/model/authorization/public.js',
      default: './dist/model/authorization/public.js',
    });
    await expect(
      readdir(`${accessRoot}/src/model/authentication`),
    ).resolves.not.toHaveLength(0);
    await expect(
      readdir(`${accessRoot}/src/model/authorization`),
    ).resolves.not.toHaveLength(0);
  });
});
